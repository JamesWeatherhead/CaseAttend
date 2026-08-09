# Third-party notices

CaseAttend includes or builds with the following third-party packages. Their
licenses apply to those components, not to CaseAttend as a whole.

- [Tesseract.js](https://github.com/naptha/tesseract.js), Apache-2.0. The
  browser worker is copied into the production build for local OCR.
- [tesseract.js-core](https://github.com/naptha/tesseract.js-core), Apache-2.0.
  WebAssembly JavaScript builds are copied into the production build.
- [English tessdata package](https://github.com/naptha/tessdata). The
  `@tesseract.js-data/eng` package metadata declares MIT, while the upstream
  repository publishes the trained data under Apache-2.0. The compressed
  English trained-data file and the upstream Apache-2.0 text are copied into
  the production build.
- [fflate](https://github.com/101arrowz/fflate), MIT. It creates and validates
  portable `.caseattend` ZIP archives. Its MIT license text is copied into the
  production asset directory.

Exact resolved package versions are recorded in `package-lock.json`. The
production vendor asset directory also includes the available Apache-2.0 and
MIT license texts from the installed packages.
