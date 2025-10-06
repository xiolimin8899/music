from io import BytesIO
import random
import string
import sys
import argparse
from huggingface_hub import HfApi

# ----------------- 参数解析 -----------------
parser = argparse.ArgumentParser(description="创建 Hugging Face Space")
parser.add_argument("--token", type=str, required=True, help="Hugging Face Token（需要写权限）")
parser.add_argument("--image", type=str, default="", help="Docker 镜像地址")
parser.add_argument("--git-url", type=str, default="", help="代理服务")
parser.add_argument("--git-repo", type=str, help="GitHub 仓库")
parser.add_argument("--git-branch", type=str, help="Git 分支")
parser.add_argument("--git-token", type=str, required=True, help="GitHub Token")
parser.add_argument("--password", type=str, required=True, help="管理员密码")
parser.add_argument("--webdav-url", type=str, required=True, help="WebDAV 地址")
parser.add_argument("--webdav-user", type=str, required=True, help="WebDAV 用户名")
parser.add_argument("--webdav-pass", type=str, required=True, help="WebDAV 密码")
args = parser.parse_args()

# ----------------- 工具函数 -----------------
def generate_random_string(length=2):
    """生成包含至少一个字母的随机字符串"""
    if length < 1:
        return ""
    chars = string.ascii_letters + string.digits
    mandatory_letter = random.choice(string.ascii_letters)
    remaining_chars = random.choices(chars, k=length - 1)
    full_chars = remaining_chars + [mandatory_letter]
    random.shuffle(full_chars)
    return "".join(full_chars)

# ----------------- 主逻辑 -----------------
if __name__ == "__main__":
    token = args.token
    if not token:
        print("Token 不能为空")
        sys.exit(1)

    api = HfApi(token=token)
    user_info = api.whoami()
    if not user_info.get("name"):
        print("未获取到用户名信息，程序退出。")
        sys.exit(1)

    # 默认镜像
    userid = user_info.get("name")
    image = args.image or "ghcr.io/zxlwq/music:latest"
    git_repo = args.git_repo or "zxlwq/music"
    git_branch = args.git_branch or "main"
    password = args.password

    # 随机生成 Space 名称
    space_name = generate_random_string(2)
    repoid = f"{userid}/{space_name}"

    # 创建 README.md
    readme_content = f"""
---
title: {space_name}
emoji: 😻
colorFrom: red
colorTo: blue
sdk: docker
app_port: 3000
pinned: false
---
Check out the configuration reference at https://huggingface.co/docs/hub/spaces-config-reference
"""
    readme_obj = BytesIO(readme_content.encode("utf-8"))

    # 创建 Space 并注入环境变量（与本项目一致）
    secrets = [
        {"key": "GIT_REPO", "value": git_repo},
        {"key": "GIT_TOKEN", "value": args.git_token},
        {"key": "GIT_BRANCH", "value": git_branch},
        {"key": "GIT_URL", "value": args.git_url},
        {"key": "PASSWORD", "value": args.password},
        {"key": "WEBDAV_URL", "value": args.webdav_url},
        {"key": "WEBDAV_USER", "value": args.webdav_user},
        {"key": "WEBDAV_PASS", "value": args.webdav_pass},
    ]

    api.create_repo(
        repo_id=repoid,
        repo_type="space",
        space_sdk="docker",
        space_secrets=secrets,
    )

    # 上传 README.md
    api.upload_file(
        repo_id=repoid,
        path_in_repo="README.md",
        path_or_fileobj=readme_obj,
        repo_type="space",
    )

    # 上传 Dockerfile
    dockerfile_content = f"FROM {image}\n"
    api.upload_file(
        repo_id=repoid,
        path_in_repo="Dockerfile",
        path_or_fileobj=BytesIO(dockerfile_content.encode("utf-8")),
        repo_type="space",
    )

    print(f"Space 创建成功: {repoid}")
