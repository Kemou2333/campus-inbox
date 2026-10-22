# Markdown 链接解析离线依赖

项目锁文件已有依赖的本地 bundle，未下载或新增运行时 npm 包。解析器与 react-markdown 使用的 remark-parse / remark-gfm 相同：mdast-util-from-markdown 加 micromark-extension-gfm 与 gfmFromMarkdown。仅构建 Markdown AST 并提取链接，不执行 HTML、不取远程 URL。显式引用按首次定义解析，字符引用和反斜杠转义交给上游 CommonMark/GFM 解析器。

- 构建入口：scripts/vendor-markdown-parser-entry.mjs
- 生成：node scripts/vendor-markdown-parser.mjs（esbuild 0.28.2，Node ESM，Node 22 目标）
- 产物：markdown-parser.mjs，116356 字节
- SHA-256：`8fa1ee77fd7b1b418383064bdba5e3f4c20bb9339e00b20e6a0392ac95be66d6`
- 无外部运行时导入，不依赖服务器 node_modules。
- 完整许可证与作者信息：MARKDOWN-PARSER-LICENSES
- 上游：[remark-parse](https://github.com/remarkjs/remark/tree/main/packages/remark-parse)、[remark-gfm](https://github.com/remarkjs/remark-gfm)、[mdast-util-from-markdown](https://github.com/syntax-tree/mdast-util-from-markdown)。

构建中实际使用的锁定包：

- ccount@2.0.1 (MIT)
- character-entities@2.0.2 (MIT)
- decode-named-character-reference@1.3.0 (MIT)
- devlop@1.1.0 (MIT)
- escape-string-regexp@5.0.0 (MIT)
- longest-streak@3.1.0 (MIT)
- markdown-table@3.0.4 (MIT)
- mdast-util-find-and-replace@3.0.3 (MIT)
- mdast-util-from-markdown@2.1.0 (MIT)
- mdast-util-gfm-autolink-literal@2.0.1 (MIT)
- mdast-util-gfm-footnote@2.1.0 (MIT)
- mdast-util-gfm-strikethrough@2.0.1 (MIT)
- mdast-util-gfm-table@2.0.0 (MIT)
- mdast-util-gfm-task-list-item@2.0.0 (MIT)
- mdast-util-gfm@3.1.0 (MIT)
- mdast-util-phrasing@4.1.0 (MIT)
- mdast-util-to-markdown@2.2.0 (MIT)
- mdast-util-to-string@4.0.0 (MIT)
- micromark-core-commonmark@2.0.4 (MIT)
- micromark-extension-gfm-autolink-literal@2.1.0 (MIT)
- micromark-extension-gfm-footnote@2.1.0 (MIT)
- micromark-extension-gfm-strikethrough@2.1.0 (MIT)
- micromark-extension-gfm-table@2.1.2 (MIT)
- micromark-extension-gfm-tagfilter@2.0.0 (MIT)
- micromark-extension-gfm-task-list-item@2.1.0 (MIT)
- micromark-extension-gfm@3.0.0 (MIT)
- micromark-factory-destination@2.0.0 (MIT)
- micromark-factory-label@2.0.0 (MIT)
- micromark-factory-space@2.1.0 (MIT)
- micromark-factory-title@2.0.0 (MIT)
- micromark-factory-whitespace@2.0.0 (MIT)
- micromark-util-character@2.0.0 (MIT)
- micromark-util-chunked@2.0.0 (MIT)
- micromark-util-classify-character@2.0.0 (MIT)
- micromark-util-combine-extensions@2.0.0 (MIT)
- micromark-util-decode-numeric-character-reference@2.0.0 (MIT)
- micromark-util-decode-string@2.0.1 (MIT)
- micromark-util-edit-map@1.0.0 (MIT)
- micromark-util-encode@2.0.0 (MIT)
- micromark-util-html-tag-name@2.0.0 (MIT)
- micromark-util-normalize-identifier@2.0.0 (MIT)
- micromark-util-resolve-all@2.0.0 (MIT)
- micromark-util-sanitize-uri@2.0.0 (MIT)
- micromark-util-subtokenize@2.0.0 (MIT)
- micromark@4.0.3 (MIT)
- unist-util-is@6.0.1 (MIT)
- unist-util-stringify-position@4.0.0 (MIT)
- unist-util-visit-parents@6.0.2 (MIT)
- unist-util-visit@5.1.0 (MIT)
- zwitch@2.0.4 (MIT)

升级前端 Markdown 依赖时须重新生成此 bundle，并运行实际 react-markdown 渲染 href 对照及整理/问答来源边界测试。
