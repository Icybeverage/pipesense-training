using UnityEngine;
using UnityEngine.UI;

namespace PipeSense
{
    public sealed class PipeSenseDemo : MonoBehaviour
    {
        private SimulatedGestureInput input;
        private Transform leftHand, rightHand, leftPipe, rightPipe;
        private Text status, caption, scoreText, traceText;
        private readonly AttemptLoop loop = new();
        private readonly VoiceNarrator voice = new();
        private readonly AgentBackendClient backend = new();
        private float startedAt;

        private static readonly Color Navy = new(0.025f, 0.05f, 0.075f);
        private static readonly Color Cyan = new(0.13f, 0.88f, 0.92f);
        private static readonly Color Pipe = new(0.24f, 0.34f, 0.39f);

        private void Start()
        {
            BuildWorld();
            input = gameObject.AddComponent<SimulatedGestureInput>();
            loop.BeginAttempt();
            startedAt = Time.time;
            caption.text = "VOICE COACH · Bring both pipe ends level, then move them toward the trap.";
        }

        private void Update()
        {
            leftHand.position = new Vector3(input.LeftHand.x, input.LeftHand.y, 0);
            rightHand.position = new Vector3(input.RightHand.x, input.RightHand.y, 0);
            leftPipe.position = Vector3.Lerp(new Vector3(-2.7f, input.LeftHand.y, 0), new Vector3(-1.75f, 0, 0), Mathf.InverseLerp(-3f, -1.45f, input.LeftHand.x));
            rightPipe.position = Vector3.Lerp(new Vector3(2.7f, input.RightHand.y, 0), new Vector3(1.75f, 0, 0), Mathf.InverseLerp(3f, 1.45f, input.RightHand.x));

            status.text = "TWO-HAND INPUT  •  A/D/W/S left  •  J/L/I/K right  •  SPACE evaluate";
            if (input.SubmitPressed) Submit();
            if (input.VoiceReplayPressed) voice.Speak(voice.LastCaption);
        }

        private void Submit()
        {
            var previous = loop.PreviousScore;
            var attempt = new PipeAttempt
            {
                attemptNumber = loop.AttemptNumber + 1,
                leftGap = Mathf.Abs(leftPipe.position.x + 1.75f),
                rightGap = Mathf.Abs(rightPipe.position.x - 1.75f),
                verticalError = leftPipe.position.y - rightPipe.position.y,
                elapsedSeconds = Time.time - startedAt,
                actionOrderValid = true
            };
            var score = PipeScorer.Evaluate(attempt);
            var agents = OfflineAgents.Evaluate(score, previous);
            loop.CompleteAttempt(score);
            scoreText.text = $"ATTEMPT {loop.AttemptNumber:00}     ALIGNMENT {score.alignment:00}     SCORE {score.total:000}";
            traceText.text = $"01 OBSERVE  {agents.observer}\n02 COACH    {agents.coach}\n03 EVALUATE {agents.evaluator}\n04 ADAPT    strategy={agents.strategy}";
            caption.text = agents.coach.ToUpperInvariant();
            voice.Speak(agents.coach.Replace("Coach: ", string.Empty));
            StartCoroutine(backend.Evaluate(attempt, score, previous, ApplyAgentResponse));

            if (score.connected)
            {
                leftPipe.position = new Vector3(-1.75f, 0, 0);
                rightPipe.position = new Vector3(1.75f, 0, 0);
                SetColor(leftPipe.gameObject, Cyan);
                SetColor(rightPipe.gameObject, Cyan);
            }
            else
            {
                loop.BeginRetry();
                startedAt = Time.time;
            }
        }

        private void ApplyAgentResponse(AgentResponse agents)
        {
            traceText.text = $"WEAVE CONNECTED\n01 OBSERVE  {agents.observer}\n02 COACH    {agents.coach}\n03 EVALUATE {agents.evaluator}\n04 ADAPT    strategy={agents.strategy}";
            caption.text = $"LIVE COACH · {agents.coach}".ToUpperInvariant();
            voice.Speak(agents.coach);
        }

        private void BuildWorld()
        {
            Camera.main.transform.position = new Vector3(0, 0.4f, -10);
            Camera.main.backgroundColor = Navy;
            Camera.main.orthographic = true;
            Camera.main.orthographicSize = 4.5f;

            leftPipe = Cylinder("Left pipe", new Vector3(-2.7f, 0.55f, 0), new Vector3(0.72f, 1.35f, 0.72f), 90, Pipe);
            rightPipe = Cylinder("Right pipe", new Vector3(2.7f, -0.35f, 0), new Vector3(0.72f, 1.35f, 0.72f), 90, Pipe);
            Cylinder("Trap left", new Vector3(-1.35f, -1.1f, 0), new Vector3(0.68f, 1.25f, 0.68f), 0, Pipe);
            Cylinder("Trap bottom", new Vector3(0, -2.35f, 0), new Vector3(0.68f, 1.35f, 0.68f), 90, Pipe);
            Cylinder("Trap right", new Vector3(1.35f, -1.1f, 0), new Vector3(0.68f, 1.25f, 0.68f), 0, Pipe);
            leftHand = Sphere("Left hand", new Vector3(-3.2f, .55f, -.5f), Cyan);
            rightHand = Sphere("Right hand", new Vector3(3.2f, -.35f, -.5f), Cyan);
            BuildCanvas();
        }

        private Transform Cylinder(string name, Vector3 position, Vector3 scale, float z, Color color)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            go.name = name; go.transform.position = position; go.transform.localScale = scale;
            go.transform.rotation = Quaternion.Euler(0, 0, z); SetColor(go, color); return go.transform;
        }

        private Transform Sphere(string name, Vector3 position, Color color)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            go.name = name; go.transform.position = position; go.transform.localScale = Vector3.one * .28f;
            SetColor(go, color); return go.transform;
        }

        private static void SetColor(GameObject go, Color color) => go.GetComponent<Renderer>().material.color = color;

        private void BuildCanvas()
        {
            var canvasGo = new GameObject("HUD", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            var canvas = canvasGo.GetComponent<Canvas>(); canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasGo.GetComponent<CanvasScaler>(); scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize; scaler.referenceResolution = new Vector2(1920, 1080);
            MakeText(canvas.transform, "PIPESENSE", 54, new Vector2(80, -55), new Vector2(900, 90), TextAnchor.UpperLeft, Cyan, out _);
            MakeText(canvas.transform, "ADAPTIVE PLUMBING LAB  /  BUILD A P-TRAP", 22, new Vector2(84, -125), new Vector2(1000, 50), TextAnchor.UpperLeft, Color.white, out _);
            MakeText(canvas.transform, "", 24, new Vector2(80, 58), new Vector2(1760, 58), TextAnchor.MiddleLeft, Color.white, out status);
            MakeText(canvas.transform, "ATTEMPT 00     ALIGNMENT --     SCORE ---", 30, new Vector2(80, -205), new Vector2(900, 60), TextAnchor.MiddleLeft, Color.white, out scoreText);
            MakeText(canvas.transform, "WEAVE TRACE PREVIEW", 20, new Vector2(1180, -80), new Vector2(650, 50), TextAnchor.UpperLeft, Cyan, out _);
            MakeText(canvas.transform, "Waiting for attempt…", 20, new Vector2(1180, -130), new Vector2(650, 260), TextAnchor.UpperLeft, new Color(.78f,.86f,.88f), out traceText);
            MakeText(canvas.transform, "", 28, new Vector2(180, 150), new Vector2(1560, 100), TextAnchor.MiddleCenter, Navy, out caption);
            caption.GetComponent<Text>().transform.parent.GetComponent<Image>().color = new Color(.15f,.95f,.85f,.96f);
        }

        private static void MakeText(Transform parent, string value, int size, Vector2 pos, Vector2 dimensions, TextAnchor anchor, Color color, out Text text)
        {
            var panel = new GameObject("Text panel", typeof(RectTransform), typeof(Image)); panel.transform.SetParent(parent, false);
            var rect = panel.GetComponent<RectTransform>(); rect.anchorMin = rect.anchorMax = pos.y > 0 ? new Vector2(.5f, 0) : new Vector2(0, 1);
            rect.pivot = pos.y > 0 ? new Vector2(.5f, 0) : new Vector2(0, 1); rect.anchoredPosition = pos; rect.sizeDelta = dimensions;
            panel.GetComponent<Image>().color = Color.clear;
            var go = new GameObject("Text", typeof(RectTransform), typeof(Text)); go.transform.SetParent(panel.transform, false);
            text = go.GetComponent<Text>(); text.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"); text.text = value; text.fontSize = size; text.color = color; text.alignment = anchor;
            var tr = go.GetComponent<RectTransform>(); tr.anchorMin = Vector2.zero; tr.anchorMax = Vector2.one; tr.offsetMin = Vector2.zero; tr.offsetMax = Vector2.zero;
        }
    }
}
