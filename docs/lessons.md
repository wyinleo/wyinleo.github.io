# 维护课程课件

Lessons 页面位于 `/lessons/`，使用 `_data/lessons.yml` 中的课程与章节数据。

1. 将 PDF 放入 `lessons/<课程目录>/`，例如 `lessons/26fall-mobile-security/`。
2. 在 `_data/lessons.yml` 对应课程的 `slides` 下添加 `title` 和 `file`。`file` 必须与 PDF 文件名完全一致，章节按数据中的顺序展示。
3. 新学期或新课程在该数据文件中添加一个课程项，填写 `id`（与课程目录同名）、`title`、`title_en`、`semester` 和 `slides`。
4. 运行 `bundle exec jekyll build`，检查 `/lessons/` 的查看和下载链接，再提交页面相关文件与 PDF 并推送到 GitHub。

PDF 会作为原文件发布，无需转换。请勿提交 `.DS_Store` 等系统文件。
