using System;
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace PipeSense
{
    [Serializable]
    internal sealed class AttemptRequest
    {
        public int attempt_number;
        public float score;
        public float previous_score;
        public string primary_issue;
        public float elapsed_seconds;
    }

    public sealed class AgentBackendClient
    {
        private readonly string endpoint;

        public AgentBackendClient(string baseUrl = "http://127.0.0.1:8787")
        {
            endpoint = baseUrl.TrimEnd('/') + "/v1/attempts/evaluate";
        }

        public IEnumerator Evaluate(PipeAttempt attempt, PipeScore score, float previousScore,
            Action<AgentResponse> onSuccess)
        {
            var request = new AttemptRequest
            {
                attempt_number = attempt.attemptNumber,
                score = score.total,
                previous_score = previousScore,
                primary_issue = score.primaryIssue,
                elapsed_seconds = attempt.elapsedSeconds
            };
            var body = Encoding.UTF8.GetBytes(JsonUtility.ToJson(request));
            using var web = new UnityWebRequest(endpoint, UnityWebRequest.kHttpVerbPOST);
            web.uploadHandler = new UploadHandlerRaw(body);
            web.downloadHandler = new DownloadHandlerBuffer();
            web.SetRequestHeader("Content-Type", "application/json");
            web.timeout = 2;
            yield return web.SendWebRequest();
            if (web.result == UnityWebRequest.Result.Success)
            {
                var response = JsonUtility.FromJson<AgentResponse>(web.downloadHandler.text);
                if (response != null) onSuccess?.Invoke(response);
            }
        }
    }
}

