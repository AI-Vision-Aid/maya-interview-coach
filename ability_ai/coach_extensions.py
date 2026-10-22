"""Optional host hooks. Standalone Maya needs no database or staff accounts."""
import logging

content_provider = None
event_recorder = None

def questions(track_id, defaults):
    if content_provider:
        try:
            return content_provider(track_id, defaults)
        except Exception:
            logging.getLogger(__name__).warning('Maya content unavailable; using bundled questions')
    return defaults

def record(event, track_id, **metrics):
    if event_recorder:
        try:
            event_recorder(event, track_id, metrics)
        except Exception:
            logging.getLogger(__name__).warning('Maya aggregate event unavailable')
