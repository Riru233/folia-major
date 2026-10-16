# e64f1543「初始状态」提交备份

本目录备份了提交 `e64f15433d652de0221f3d4935088e99f1a37e3c`（subject：`初始状态`）
相对于其父提交 `a3574a784cb20972ac85edfd71449b1eb848ea7f`（`release: v0.7.17`）所更改的文件。

备份完成后该提交已从 `main` 历史中删除（`git rebase --onto official/main e64f1543 main`）。

## 文件清单

| 提交内的路径 | 备份路径 | 相对父提交的改动 |
| --- | --- | --- |
| `deploy/docker/gateway/entrypoint.sh` | `bak/deploy/docker/gateway/entrypoint.sh` | mode `100755 → 100644`（内容不变） |
| `deploy/docker/scripts/smoke-test.sh` | `bak/deploy/docker/scripts/smoke-test.sh` | mode `100755 → 100644`（内容不变） |
| `deploy/docker/scripts/validate-version.sh` | `bak/deploy/docker/scripts/validate-version.sh` | mode `100755 → 100644`（内容不变） |
| `deploy/docker/sync-server/entrypoint.sh` | `bak/deploy/docker/sync-server/entrypoint.sh` | mode `100755 → 100644`（内容不变） |
| `package-lock.json` | `bak/package-lock.json` | 内容改动（14 增 / 19 删） |
| `packaging/aur/folia-major-bin/update.sh` | `bak/packaging/aur/folia-major-bin/update.sh` | mode `100755 → 100644`（内容不变） |

## 备份来源

- 提交：`e64f15433d652de0221f3d4935088e99f1a37e3c`
- 父提交：`a3574a784cb20972ac85edfd71449b1eb848ea7f`
- 提取方式：`git archive --format=tar e64f1543 -- <上述路径>`
- 备份内容为「提交后」版本，文件权限位在解包时不一定保留，具体 mode 见上表。
