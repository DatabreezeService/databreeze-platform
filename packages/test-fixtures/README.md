# Test Fixtures

Synthetic, non-sensitive fixtures used to prove contract and local/cloud processing parity across
TypeScript, Kotlin, and Python.

`contracts/v1/manifest.json` is the versioned shared contract fixture registry. Every case has a
stable ID, canonical schema ID, expected acceptance result, and a dedicated hand-authored JSON
source. Consumers use the manifest result instead of deriving an expectation from their own
validator.
