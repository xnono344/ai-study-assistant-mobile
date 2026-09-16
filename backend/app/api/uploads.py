"""File upload endpoint — accepts multipart/form-data and records a row.

MVP: stores the file under UPLOAD_DIR (default ./uploads), computes a
sha256 hash, derives the upload_type from the content_type, and persists
an UploadModel row. Returns the new UploadResponse to the mobile client.

The frontend TS expects: `{ id: string; filename: string }`. We return
both, plus the rest of UploadResponse (which is a superset and won't
break the typed accessor since TS interfaces allow extra fields).
"""

from __future__ import annotations

import hashlib
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.schemas.upload import UploadModel, UploadResponse, UploadType

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/uploads", tags=["uploads"])

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "./uploads")).resolve()
MAX_BYTES = int(os.getenv("UPLOAD_MAX_BYTES", str(50 * 1024 * 1024)))  # 50 MB


def _detect_upload_type(content_type: str | None) -> UploadType:
    ct = (content_type or "").lower()
    if ct.startswith("application/pdf") or ct.endswith("pdf"):
        return UploadType.PDF
    if ct.startswith("image/"):
        return UploadType.IMAGE
    return UploadType.TEXT


@router.post("", response_model=UploadResponse, status_code=201)
async def upload_file(
    file: UploadFile = File(...),
    x_session_id: str | None = Header(None, alias="X-Session-Id"),
    session: AsyncSession = Depends(get_db_session),
) -> UploadResponse:
    """Accept a multipart file upload and persist metadata + bytes."""
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    # Read with a size cap to avoid memory abuse
    contents = await file.read()
    if len(contents) > MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max {MAX_BYTES // (1024 * 1024)} MB.",
        )
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file")

    content_hash = hashlib.sha256(contents).hexdigest()
    upload_type = _detect_upload_type(file.content_type)

    # Persist file bytes
    safe_name = file.filename or "upload.bin"
    safe_name = safe_name.replace("/", "_").replace("..", "_")
    disk_path = UPLOAD_DIR / f"{content_hash[:16]}_{safe_name}"
    disk_path.write_bytes(contents)

    row = UploadModel(
        filename=safe_name,
        content_type=file.content_type or "application/octet-stream",
        file_size=len(contents),
        content_hash=content_hash,
        upload_type=upload_type,
        extracted_text=None,
        source_context=None,
        lesson_id=None,
    )
    session.add(row)
    await session.flush()

    logger.info(
        "file_uploaded filename=%s size=%d type=%s session=%s",
        safe_name, len(contents), upload_type, x_session_id or "anon",
    )

    return UploadResponse(
        id=row.uuid,
        filename=row.filename,
        content_type=row.content_type,
        file_size=row.file_size,
        content_hash=row.content_hash,
        upload_type=row.upload_type,
        extracted_text=row.extracted_text,
        source_context=row.source_context,
        lesson_id=UUID(bytes=row.lesson_id) if row.lesson_id else None,
        created_at=row.created_at or datetime.now(timezone.utc),
    )