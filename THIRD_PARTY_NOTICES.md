# Third-Party Notices

Этот репозиторий содержит объединенную кодовую базу `Eclipse Hopson Sentinel`.

## Основа текущего CLI

Основной текущий CLI-слой основан на локально адаптированной и переименованной версии репозитория `Gitlawb/openclaude`, ранее импортированной в этот проект и затем русифицированной и ребрендированной.

- официальный upstream: https://github.com/Gitlawb/openclaude
- точный upstream commit SHA первоначального импорта: **не зафиксирован**
- upstream уведомляет, что его базовый Claude Code слой является proprietary,
  а MIT относится только к собственным модификациям OpenClaude там, где это
  юридически допустимо

До установления точного provenance и отдельной юридической проверки этот
репозиторий нельзя публиковать, продавать или распространять как полностью
MIT-лицензированный продукт.

## Импортированный Rust workspace

Каталог `rust/` был импортирован из временного публичного репозитория:

- `ultraworkers/claw-code-parity`
- URL: `https://github.com/ultraworkers/claw-code-parity`

Импорт производился как отдельный runtime workspace для дальнейшей интеграции в `Eclipse Hopson Sentinel`.

На момент импорта:

- репозиторий позиционировался как parity / Rust-port work
- в `rust/Cargo.toml` был указан `license = "MIT"`
- основной disabled-репозиторий `ultraworkers/claw-code` был недоступен для clone и использовалось публичное parity-зеркало

## Release gate

- `package.json` содержит `private: true`
- npm publish запрещён до документирования точных commit SHA и применимых
  лицензий для TypeScript CLI и Rust workspace
- новые файлы нельзя восстанавливать из неофициальных зеркал только ради
  прохождения typecheck
