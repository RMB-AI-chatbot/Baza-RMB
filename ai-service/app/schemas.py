"""Public API contracts (shared with the widget and the admin portal)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    session_id: str | None = Field(None, description="Returned by the first response; send it back on every turn.")
    message: str = Field(..., min_length=1, max_length=4000)
    language: str | None = Field(None, description="UI language hint (en|fr|rw). The bot detects the language anyway.")
    stream: bool = Field(False, description="true = Server-Sent Events (meta, delta, final)")


class Source(BaseModel):
    n: int = Field(..., description="Citation number used in the answer text as [n]")
    document_id: str
    document: str
    short_title: str
    section: str | None = None
    heading: str | None = None
    page: str | None = None
    url: str | None = None
    language: str | None = None


class FormField(BaseModel):
    name: str
    label: str
    type: str
    required: bool = False
    max_length: int | None = None
    contact: bool = False


class FormSpec(BaseModel):
    type: str
    title: str
    anonymous_allowed: bool = False
    anonymous_default: bool = False
    confidential: bool = False
    lookup: bool = False
    fields: list[FormField]
    prefill: dict[str, str] = {}


class ChatResponse(BaseModel):
    session_id: str
    message_id: int | None
    answer: str
    language: str
    intent: str
    category: str
    action: Literal["none", "form", "emergency", "handover", "not_covered"]
    sources: list[Source] = []
    disclaimer: str | None = None
    form: FormSpec | None = None
    emergency_contacts: list[dict[str, Any]] | None = None
    notice: str | None = None


class CaseCreateRequest(BaseModel):
    session_id: str | None = None
    type: str = Field(..., description="Form type from the chat response, e.g. grievance")
    fields: dict[str, Any]
    anonymous: bool = False


class CaseCreateResponse(BaseModel):
    reference_number: str
    routed_to: str
    expected_response_time: str
    message: str


class CaseStatusResponse(BaseModel):
    reference_number: str
    type: str
    status: str
    routed_to: str
    created_at: str
    updated_at: str


class FeedbackRequest(BaseModel):
    session_id: str
    message_id: int
    rating: Literal[-1, 1]
    comment: str | None = Field(None, max_length=1000)


class WidgetConfig(BaseModel):
    assistant_name: str
    enabled: bool
    welcome_message: str
    suggestions: list[str]
    languages: list[str]
    contacts: dict[str, Any]
