---
"oxlint-plugin-effect": minor
---

Add the recommended `preferTaggedConstructors` rule to report raw `_tag` object construction and prefer `Schema.TaggedUnion` case constructors or `Schema.TaggedStruct` constructors. `Data.taggedEnum` and existing domain constructors remain valid. Recognize static keys, type-only wrappers, and const tag aliases while allowing schema declarations.
