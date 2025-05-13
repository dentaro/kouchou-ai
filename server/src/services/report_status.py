import json
import logging
import threading
from datetime import UTC, datetime

import requests

from src.config import settings
from src.schemas.admin_report import ReportInput
from src.schemas.report import Report, ReportStatus, ReportVisibility

# ロガーの設定
logger = logging.getLogger("uvicorn")

STATE_FILE = settings.DATA_DIR / "report_status.json"
_lock = threading.RLock()
_report_status = {}


# NOTE: 広聴AIをver3.0にした段階で削除する
def convert_old_format_status(status: dict) -> dict:
    """旧形式のレポートのステータスを新形式に変換する
    旧形式では公開/非公開をis_publicで管理していたが、新形式ではvisibilityで管理している
    """
    for slug, report_status in status.items():
        if "is_public" in report_status:
            report_status["visibility"] = (
                ReportVisibility.PUBLIC.value if report_status["is_public"] else ReportVisibility.PRIVATE.value
            )
            report_status.pop("is_public")
            status[slug] = report_status
    return status


def load_status() -> None:
    global _report_status
    try:
        with open(STATE_FILE) as f:
            _report_status = convert_old_format_status(json.load(f))
    except FileNotFoundError:
        _report_status = {}
    except json.JSONDecodeError:
        _report_status = {}


def load_status_as_reports(include_deleted: bool = False) -> list[Report]:
    global _report_status
    try:
        with open(STATE_FILE) as f:
            _report_status = convert_old_format_status(json.load(f))
    except FileNotFoundError:
        _report_status = {}
    except json.JSONDecodeError:
        _report_status = {}

    reports = [Report(**report) for report in _report_status.values()]

    if not include_deleted:
        reports = [report for report in reports if report.status != ReportStatus.DELETED]

    return reports


def save_status() -> None:
    with _lock:
        # ディレクトリが存在しない場合は作成
        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)

        # ローカルに保存
        with open(STATE_FILE, "w") as f:
            json.dump(_report_status, f, indent=4, ensure_ascii=False)


def add_new_report_to_status(report_input: ReportInput) -> None:
    with _lock:
        _report_status[report_input.input] = {
            "slug": report_input.input,
            "status": "processing",
            "title": report_input.question,
            "description": report_input.intro,
            "is_pubcom": report_input.is_pubcom,
            "visibility": ReportVisibility.UNLISTED.value,
            "created_at": datetime.now(UTC).isoformat(),  # タイムゾーン付きISO形式で追加
        }
        save_status()


def set_status(slug: str, status: str) -> None:
    with _lock:
        if slug not in _report_status:
            raise ValueError(f"slug {slug} not found in report status")
        _report_status[slug]["status"] = status
        save_status()


def get_status(slug: str) -> str:
    with _lock:
        return _report_status.get(slug, {}).get("status", "undefined")


def invalidate_report_cache(slug: str) -> None:
    # Next.jsのキャッシュを破棄するAPIを呼び出す
    try:
        logger.info(f"Attempting to revalidate Next.js cache for path: /{slug}")

        # 環境変数からrevalidate URLを取得
        revalidate_url = settings.REVALIDATE_URL

        logger.info(f"Using revalidate API at: {revalidate_url}")

        response = requests.post(
            revalidate_url,
            json={"path": f"/{slug}", "secret": settings.REVALIDATE_SECRET},
            timeout=3,  # タイムアウトを短く設定
            headers={"Content-Type": "application/json"},
        )

        if response.status_code == 200:
            logger.info("Successfully revalidated Next.js cache")
        else:
            logger.error(f"Failed to revalidate: {response.status_code} {response.text}")
    except Exception as e:
        # revalidateに失敗しても、メタデータの更新は成功しているので例外は投げない
        logger.error(f"Failed to call revalidate API for {slug}: {e}")


def toggle_report_visibility_state(slug: str, new_visibility: ReportVisibility) -> str:
    with _lock:
        if slug not in _report_status:
            raise ValueError(f"slug {slug} not found in report status")        
        # enumの値を文字列に変換して保存
        _report_status[slug]["visibility"] = new_visibility.value
        
        save_status()
        invalidate_report_cache(slug)

        return _report_status[slug]["visibility"]
    


def update_report_metadata(slug: str, title: str = None, description: str = None) -> dict:
    """レポートのメタデータ（タイトル、説明）を更新する

    Args:
        slug: レポートのスラッグ
        title: 新しいタイトル（Noneの場合は更新しない）
        description: 新しい説明（Noneの場合は更新しない）

    Returns:
        更新後のレポート情報

    Raises:
        ValueError: 指定されたスラッグのレポートが存在しない場合
    """
    with _lock:
        if slug not in _report_status:
            raise ValueError(f"slug {slug} not found in report status")

        # タイトルの更新（指定された場合のみ）
        if title is not None:
            _report_status[slug]["title"] = title

        # 説明の更新（指定された場合のみ）
        if description is not None:
            _report_status[slug]["description"] = description

        save_status()

        # hierarchical_result.json ファイルも更新する
        report_path = settings.REPORT_DIR / slug / "hierarchical_result.json"
        if report_path.exists():
            try:
                with open(report_path) as f:
                    report_data = json.load(f)

                # タイトルの更新（指定された場合のみ）
                if title is not None and "config" in report_data:
                    report_data["config"]["question"] = title

                # 概要の更新（指定された場合のみ）
                if description is not None:
                    report_data["overview"] = description

                # 更新したデータを書き込む
                with open(report_path, "w") as f:
                    json.dump(report_data, f, ensure_ascii=False, indent=2)
            except Exception as e:
                # ファイルの更新に失敗しても、ステータスの更新は成功しているので例外は投げない
                # ただしログには残す
                logger.error(f"Failed to update hierarchical_result.json for {slug}: {e}")

        invalidate_report_cache(slug)
        return _report_status[slug]
