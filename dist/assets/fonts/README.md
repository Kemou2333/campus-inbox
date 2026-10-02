# Font sources

- Rounded: ChillRoundM v1.805 by ChillType / Warren2060. Official release: https://github.com/Warren2060/ChillRound/releases/tag/v1.805 . The source contains 12,329 Unicode characters, including commonly used simplified and traditional characters. It provides regular weight only; bold UI headings use browser synthesis.
- Square: Adobe Source Han Sans CN VF 2.005, variable weights 250–900. Official release: https://github.com/adobe-fonts/source-han-sans/releases/tag/2.005R . Official CN WOFF2: https://raw.githubusercontent.com/adobe-fonts/source-han-sans/release/Variable/WOFF2/TTF/Subset/SourceHanSansCN-VF.ttf.woff2 .

Both fonts are under the SIL Open Font License 1.1. Original licenses are included in this directory. Fonts are split into Unicode subsets for demand-driven loading. Subset fonts use the internal family names Campus Rounded and Campus Square to respect reserved font names; glyph outlines are unchanged. Missing rounded glyphs fall back to Source Han Sans and system fonts.

Set the body's data-font attribute to rounded or square. Both versions share the same layout and font sizes.
