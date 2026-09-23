# 维护课程课件

Lessons 目录位于 `/lessons/`，仅展示课程链接。各课程的介绍和课件位于 `/lessons/<课程目录>/`，使用 `_data/lessons.yml` 中的数据和 `_layouts/lesson.html` 模板。

1. 将 PDF 放入 `lessons/<课程目录>/`，例如 `lessons/26fall-mobile-security/`。
2. 在 `_data/lessons.yml` 对应课程的 `slides` 下添加 `title` 和 `file`。`file` 必须与 PDF 文件名完全一致，章节按数据中的顺序展示。
3. 新学期或新课程在该数据文件中添加一个课程项，填写 `id`（与课程目录同名）、`label`（目录中的链接文字）、`description`（简要介绍）和 `slides`。在 `_pages/` 中参照 `26fall-mobile-security.html` 新建页面，设置 `layout: lesson`、对应的 `course_id`、`title` 和 `permalink`。
4. 运行 `bundle exec jekyll build`，检查课程目录、子页面及 PDF 查看和下载链接，再提交页面相关文件与 PDF 并推送到 GitHub。

PDF 会作为原文件发布，无需转换。请勿提交 `.DS_Store` 等系统文件。
