# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.x     | :white_check_mark: |

Only the latest published 0.x release receives fixes.

## Security Model

`@yedoma-labs/kulyn-flags` is a **developer tool** for maintaining a feature flag register and for checking source code in tests and CI. It does not evaluate flags at runtime and does not make network requests.

The security model assumes:

- **Flag registers** are written by trusted developers and reviewed like other code.
- **Source text** passed to `findFlagKeysInSource` may come from any file in the repository. Treat it as untrusted input for the purpose of resource use.
- **Dates and keys** in the register may be malformed. They are validated, and invalid values throw `FlagRegistryError`.

## Security Features

1. **ReDoS resistance in the source scanner**
   - Patterns use only fixed or bounded quantifiers and no nested quantifiers.
   - Quoted literals are capped at 100 characters.
   - Comments and template literals are masked in a single linear pass.
   - Tests in `tests/scan.test.ts` check 1 MB inputs with pathological shapes.

2. **Strict date parsing**
   - Dates must be real calendar dates (for example `2026-02-30` is rejected).
   - Date-times need an explicit timezone.

3. **Input validation**
   - Keys must match `/^[a-z][a-z0-9-.]{1,79}$/`.
   - Duplicate keys, blank owners and unknown kinds are rejected.
   - Lifetime overrides must be positive integers or `null`.

4. **No dynamic code and no I/O**
   - The library never evaluates strings as code.
   - It does not read the file system or the network. The caller passes in source text.

5. **Zero runtime dependencies**
   - Nothing is loaded at runtime beyond this package.

## Known Limitations

- **Static analysis only.** `findFlagKeysInSource` is a text scanner, not a parser. It can miss keys built at runtime and can be confused by regex literals that contain quotes. Results are a hygiene signal, not proof that a flag is unused.
- **Maximum lifetimes are checked against the register, not the deployed state.** A flag can be in use in production even after it is removed from the code.

## Reporting a Vulnerability

Please do not open a public issue for security problems.

Report it through GitHub's private vulnerability reporting on [yedoma-labs/kulyn-flags](https://github.com/yedoma-labs/kulyn-flags/security/advisories/new).

Please include:

- Description of the vulnerability
- Steps to reproduce, ideally a minimal input
- Potential impact
- Suggested fix, if you have one

We aim to respond within 48 hours and will coordinate disclosure.

## Security Best Practices

1. **Do not pass untrusted input to the register.** Flag definitions are developer code.

2. **Bound the input size for the scanner in your own tooling** if you scan generated or vendored files, for example by excluding `node_modules` and build output.

3. **Run the hygiene check in CI** with `failOn` set to the codes you want enforced.

## Dependency Security

Run `pnpm audit` regularly. The package has no runtime dependencies.

## License

MIT. See [LICENSE](LICENSE) for details.
