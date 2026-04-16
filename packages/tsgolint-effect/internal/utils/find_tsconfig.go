package utils

import (
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"sync"

	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/tsoptions"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/microsoft/typescript-go/shim/vfs"
	"github.com/typescript-eslint/tsgolint/internal/collections"
)

type TsConfigResolver struct {
	fs               vfs.FS
	currentDirectory string
	configs          collections.SyncMap[tspath.Path, *tsoptions.ParsedCommandLine]
	extendedConfigs  extendedConfigCache
}

// extendedConfigCache implements tsoptions.ExtendedConfigCache
type extendedConfigCache struct {
	entries sync.Map // tspath.Path -> *tsoptions.ExtendedConfigCacheEntry
}

func (c *extendedConfigCache) GetExtendedConfig(
	fileName string,
	path tspath.Path,
	resolutionStack []string,
	host tsoptions.ParseConfigHost,
) *tsoptions.ExtendedConfigCacheEntry {
	if entry, ok := c.entries.Load(path); ok {
		return entry.(*tsoptions.ExtendedConfigCacheEntry)
	}

	entry := tsoptions.ParseExtendedConfig(fileName, path, resolutionStack, host, c)
	actual, _ := c.entries.LoadOrStore(path, entry)
	return actual.(*tsoptions.ExtendedConfigCacheEntry)
}

func NewTsConfigResolver(fs vfs.FS, currentDirectory string) *TsConfigResolver {
	return &TsConfigResolver{
		fs:               fs,
		currentDirectory: currentDirectory,
	}
}

// computeConfigFileName walks up directories from fileName looking for tsconfig.json/jsconfig.json.
// If skipSearchInDirectoryOfFile is true, it skips the file's own directory.
func (r *TsConfigResolver) computeConfigFileName(fileName string, skipSearchInDirectoryOfFile bool) string {
	dir := tspath.GetDirectoryPath(fileName)

	for {
		if !skipSearchInDirectoryOfFile {
			tsconfig := tspath.CombinePaths(dir, "tsconfig.json")
			if r.fs.FileExists(tsconfig) {
				return tsconfig
			}

			jsconfig := tspath.CombinePaths(dir, "jsconfig.json")
			if r.fs.FileExists(jsconfig) {
				return jsconfig
			}
		}

		if strings.HasSuffix(dir, "/node_modules") {
			return ""
		}

		parent := tspath.GetDirectoryPath(dir)
		if parent == dir {
			return ""
		}

		dir = parent
		skipSearchInDirectoryOfFile = false
	}
}

// loadConfig parses and caches a tsconfig at the given path.
func (r *TsConfigResolver) loadConfig(configFileName string) *tsoptions.ParsedCommandLine {
	path := r.toPath(configFileName)
	if config, ok := r.configs.Load(path); ok {
		return config
	}

	config, _ := tsoptions.GetParsedCommandLineOfConfigFilePath(
		configFileName,
		path,
		nil,
		nil,
		r,
		&r.extendedConfigs,
	)
	if config != nil {
		r.configs.Store(path, config)
	}
	return config
}

// FindTsconfigForFile finds the tsconfig.json that governs the given file.
func (r *TsConfigResolver) FindTsconfigForFile(filePath string, skipSearchInDirectoryOfFile bool) (configPath string, found bool) {
	configFileName := r.computeConfigFileName(filePath, skipSearchInDirectoryOfFile)

	if configFileName == "" {
		return "", false
	}

	normalizedPath := tspath.ToPath(filePath, r.currentDirectory, r.fs.UseCaseSensitiveFileNames())

	result := r.findConfigWithReferences(filePath, normalizedPath, configFileName, nil, nil)

	if result.configFileName != "" {
		return result.configFileName, true
	}

	return "", false
}

type configSearchResult struct {
	configFileName string
}

type searchNode struct {
	configFileName string
}

func (r *TsConfigResolver) findConfigWithReferences(
	fileName string,
	path tspath.Path,
	configFileName string,
	visited *collections.SyncSet[searchNode],
	fallback *configSearchResult,
) configSearchResult {
	var configs collections.SyncMap[tspath.Path, *tsoptions.ParsedCommandLine]
	if visited == nil {
		visited = &collections.SyncSet[searchNode]{}
	}

	search := BreadthFirstSearch(
		searchNode{configFileName: configFileName},
		func(node searchNode) []searchNode {
			if config, ok := configs.Load(r.toPath(node.configFileName)); ok && len(config.ProjectReferences()) > 0 {
				references := config.ResolvedProjectReferencePaths()
				return Map(references, func(configFileName string) searchNode {
					return searchNode{configFileName: configFileName}
				})
			}
			return nil
		},
		func(node searchNode) (isResult bool, stop bool) {
			configFilePath := r.toPath(node.configFileName)

			config := r.loadConfig(node.configFileName)
			if config == nil {
				return false, false
			}
			configs.Store(configFilePath, config)
			if len(config.FileNames()) == 0 {
				return false, false
			}
			if config.CompilerOptions().Composite == core.TSTrue {
				if !config.PossiblyMatchesFileName(fileName) {
					return false, false
				}
			}

			if slices.ContainsFunc(config.FileNames(), func(file string) bool {
				if r.fs.UseCaseSensitiveFileNames() {
					if file == string(path) {
						return true
					}
				} else {
					if strings.EqualFold(file, string(path)) {
						return true
					}
				}

				pathBaseName := filepath.Base(string(path))
				fileBaseName := filepath.Base(file)
				if r.fs.UseCaseSensitiveFileNames() {
					if fileBaseName != pathBaseName {
						return false
					}
				} else {
					if !strings.EqualFold(fileBaseName, pathBaseName) {
						return false
					}
				}

				return r.toPath(file) == path
			}) {
				return true, true
			}

			return false, false
		},
		BreadthFirstSearchOptions[searchNode]{
			Visited: visited,
			PreprocessLevel: func(level *BreadthFirstSearchLevel[searchNode]) {
				level.Range(func(node searchNode) bool {
					return true
				})
			},
		},
	)

	tsconfig := ""
	if len(search.Path) > 0 {
		tsconfig = search.Path[0].configFileName
	}

	if search.Stopped {
		return configSearchResult{configFileName: tsconfig}
	}
	if tsconfig != "" {
		fallback = &configSearchResult{configFileName: tsconfig}
	}

	if config, ok := configs.Load(r.toPath(configFileName)); ok && config.CompilerOptions().DisableSolutionSearching.IsTrue() {
		if fallback != nil {
			return *fallback
		}
	}

	// Ancestor search: look for tsconfig.json higher up from the current config
	ancestorConfigName := r.computeConfigFileName(configFileName, true)
	if ancestorConfigName != "" {
		return r.findConfigWithReferences(
			fileName,
			path,
			ancestorConfigName,
			visited,
			fallback,
		)
	}
	if fallback != nil {
		return *fallback
	}

	return configSearchResult{configFileName: ""}
}

type ResolutionResult struct {
	file   string
	config string
}

func (r *TsConfigResolver) work(in <-chan string, out chan<- ResolutionResult) {
	for file := range in {
		config := r.computeConfigFileName(file, false)
		if config == "" {
			out <- ResolutionResult{
				file:   file,
				config: config,
			}
			continue
		}

		fileNormalized := tspath.ToPath(file, r.currentDirectory, r.fs.UseCaseSensitiveFileNames())

		result := r.findConfigWithReferences(file, fileNormalized, config, nil, nil)
		out <- ResolutionResult{
			config: result.configFileName,
			file:   file,
		}
	}
}

func (r *TsConfigResolver) FindTsConfigParallel(fileNames []string) map[string]string {
	in := make(chan string, len(fileNames))
	out := make(chan ResolutionResult, len(fileNames))

	numWorker := runtime.GOMAXPROCS(0)

	var wg sync.WaitGroup
	for range numWorker {
		wg.Go(func() {
			r.work(in, out)
		})
	}

	for i := range fileNames {
		in <- fileNames[i]
	}
	close(in)

	go func() {
		wg.Wait()
		close(out)
	}()

	res := make(map[string]string, len(fileNames))
	for result := range out {
		res[result.file] = result.config
	}

	return res
}

func (r *TsConfigResolver) toPath(fileName string) tspath.Path {
	return tspath.ToPath(fileName, r.currentDirectory, r.fs.UseCaseSensitiveFileNames())
}

func (r *TsConfigResolver) FS() vfs.FS {
	return r.fs
}

func (r *TsConfigResolver) GetCurrentDirectory() string {
	return r.currentDirectory
}
