using UnityEngine;
using UnityEngine.InputSystem;

namespace PipeSense
{
    public interface IGestureInput
    {
        Vector2 LeftHand { get; }
        Vector2 RightHand { get; }
        bool SubmitPressed { get; }
        bool VoiceReplayPressed { get; }
    }

    public sealed class SimulatedGestureInput : MonoBehaviour, IGestureInput
    {
        [SerializeField] private float speed = 1.8f;
        public Vector2 LeftHand { get; private set; } = new(-3.2f, 0.55f);
        public Vector2 RightHand { get; private set; } = new(3.2f, -0.35f);
        public bool SubmitPressed => Keyboard.current?.spaceKey.wasPressedThisFrame ?? false;
        public bool VoiceReplayPressed => Keyboard.current?.vKey.wasPressedThisFrame ?? false;

        private void Update()
        {
            var keyboard = Keyboard.current;
            if (keyboard == null) return;
            var dt = Time.deltaTime * speed;
            LeftHand += new Vector2(
                (keyboard.dKey.isPressed ? 1 : 0) - (keyboard.aKey.isPressed ? 1 : 0),
                (keyboard.wKey.isPressed ? 1 : 0) - (keyboard.sKey.isPressed ? 1 : 0)) * dt;
            RightHand += new Vector2(
                (keyboard.lKey.isPressed ? 1 : 0) - (keyboard.jKey.isPressed ? 1 : 0),
                (keyboard.iKey.isPressed ? 1 : 0) - (keyboard.kKey.isPressed ? 1 : 0)) * dt;

            var mouse = Mouse.current;
            if (mouse != null && mouse.leftButton.isPressed)
            {
                var point = mouse.position.ReadValue();
                var world = Camera.main.ScreenToWorldPoint(new Vector3(point.x, point.y, 10f));
                LeftHand = new Vector2(world.x, world.y);
            }
            if (mouse != null && mouse.rightButton.isPressed)
            {
                var point = mouse.position.ReadValue();
                var world = Camera.main.ScreenToWorldPoint(new Vector3(point.x, point.y, 10f));
                RightHand = new Vector2(world.x, world.y);
            }
        }
    }

    // Adapter seam for homuler/MediaPipeUnityPlugin. Keep the demo on the
    // simulated provider until the plugin's sample scene is stable on-site.
    public sealed class MediaPipeGestureInput : MonoBehaviour, IGestureInput
    {
        public Vector2 LeftHand { get; private set; }
        public Vector2 RightHand { get; private set; }
        public bool SubmitPressed { get; private set; }
        public bool VoiceReplayPressed => false;

        public void PushLandmarks(Vector2 leftPalm, Vector2 rightPalm, bool bothPinching)
        {
            LeftHand = leftPalm;
            RightHand = rightPalm;
            SubmitPressed = bothPinching;
        }

        private void LateUpdate() => SubmitPressed = false;
    }
}
