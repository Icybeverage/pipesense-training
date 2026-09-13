import unittest
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError

from fastapi.testclient import TestClient

from agents import Attempt, build_response, offline_loop, run_loop
from app import app


class AgentLoopTests(unittest.TestCase):
    def test_height_issue_produces_specific_hint(self):
        result = offline_loop(Attempt(1, 41, -1, "height_alignment"))
        self.assertIn("Level", result["coach"])
        self.assertEqual(result["provider"], "deterministic-offline")

    def test_retry_reports_improvement(self):
        result = offline_loop(Attempt(2, 82, 41, "connection_gap"))
        self.assertTrue(result["improved"])
        self.assertIn("41 to 82", result["evaluator"])

    def test_failed_retry_changes_strategy_deterministically(self):
        result = offline_loop(Attempt(2, 40, 41, "height_alignment"))
        self.assertEqual(result["strategy"], "change_modality_visual")
        self.assertIn("Watch the seam", result["coach"])
        later = offline_loop(Attempt(4, 40, 41, "height_alignment"))
        self.assertEqual(later["strategy"], "step_by_step_reset")
        self.assertIn("Reset fully", later["coach"])

    @patch.dict("os.environ", {}, clear=False)
    def test_run_loop_default_is_offline_without_external_call(self):
        result = run_loop(Attempt(2, 40, 41, "height_alignment"))
        self.assertFalse(result["provider_used"])
        self.assertEqual(result["provider"], "deterministic-offline")

    @patch("agents._inference_op")
    def test_run_loop_preserves_provider_evidence_after_second_sanitize(self, mock_inference):
        mock_inference.return_value = {
            "observer": "Mocked observer detail.",
            "coach": "Mocked coach text from inference.",
            "evaluator": "Mocked evaluator summary.",
            "strategy": "change_modality_kinesthetic",
            "__provider_evidence": {
                "provider": "wandb-inference:test-model",
                "provider_used": True,
            },
        }
        result = run_loop(Attempt(2, 40, 41, "height_alignment"))
        self.assertEqual(result["provider"], "wandb-inference:test-model")
        self.assertTrue(result["provider_used"])
        self.assertEqual(result["coach"], "Mocked coach text from inference.")

    @patch.dict(
        "os.environ",
        {"PIPESENSE_ENABLE_WANDB_INFERENCE": "1", "WANDB_API_KEY": "test-key"},
        clear=False,
    )
    @patch("agents.urlopen")
    def test_http_error_metadata_survives_second_sanitize(self, mock_urlopen):
        mock_urlopen.side_effect = HTTPError(
            url="https://api.inference.wandb.ai/v1/chat/completions",
            code=503,
            msg="Service Unavailable",
            hdrs=None,
            fp=None,
        )
        result = run_loop(Attempt(2, 40, 41, "height_alignment"))
        self.assertFalse(result["provider_used"])
        self.assertEqual(result["provider"], "deterministic-offline")
        self.assertEqual(result["provider_error"], "HTTPError")
        self.assertEqual(result["provider_error_meta"]["status"], 503)
        self.assertEqual(result["provider_error_meta"]["reason"], "Service Unavailable")

    @patch.dict("os.environ", {}, clear=True)
    def test_build_response_contains_honest_evidence(self):
        result = build_response(Attempt(1, 55, -1, "sequence"))
        self.assertIn("outcome", result)
        self.assertIn("evidence", result)
        self.assertFalse(result["evidence"]["provider"]["configured"])
        self.assertFalse(result["evidence"]["provider"]["used"])
        self.assertFalse(result["evidence"]["tracing"]["active"])


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_validate_bounds(self):
        payload = {
            "attempt_number": 0,
            "score": 110,
            "previous_score": -2,
            "primary_issue": "height_alignment",
            "elapsed_seconds": 10,
        }
        response = self.client.post("/v1/attempts/evaluate", json=payload)
        self.assertEqual(response.status_code, 422)

    @patch.dict("os.environ", {}, clear=True)
    def test_structured_response_shape(self):
        payload = {
            "attempt_number": 2,
            "score": 40,
            "previous_score": 41,
            "primary_issue": "height_alignment",
            "elapsed_seconds": 15,
            "telemetry": {"events_count": 10, "camera_frames_seen": 20, "input_mode": "keyboard_mouse"},
        }
        response = self.client.post("/v1/attempts/evaluate", json=payload)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("attempt", body)
        self.assertIn("outcome", body)
        self.assertIn("evidence", body)
        self.assertEqual(body["outcome"]["strategy"], "change_modality_visual")

    @patch.dict("os.environ", {}, clear=True)
    def test_voice_url_reports_unconfigured_without_secrets(self):
        response = self.client.post("/v1/voice/signed-url")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"configured": False, "error": "voice_not_configured"})

    @patch.dict(
        "os.environ",
        {"ELEVENLABS_API_KEY": "test-key", "ELEVENLABS_AGENT_ID": "test-agent"},
        clear=True,
    )
    @patch("app.urlopen")
    def test_voice_url_returns_only_temporary_provider_url(self, mock_urlopen):
        provider_response = MagicMock()
        provider_response.read.return_value = b'{"signed_url":"wss://example.invalid/session"}'
        mock_urlopen.return_value.__enter__.return_value = provider_response
        response = self.client.post("/v1/voice/signed-url")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["provider"], "elevenlabs-live")
        self.assertEqual(response.json()["signed_url"], "wss://example.invalid/session")
        self.assertNotIn("test-key", response.text)


if __name__ == "__main__":
    unittest.main()
