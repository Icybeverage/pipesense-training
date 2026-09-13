using UnityEngine;

namespace PipeSense.Hands
{
    /// <summary>
    /// Keyboard/mouse stand-in for tracked hands so the demo runs without a camera.
    /// Left hand: WASD move, Q/E depth, Z/X yaw, C/V pitch, hold Left Shift to grip.
    /// Right hand: arrows move, comma/period depth, N/M yaw, K/L pitch, hold Right Shift.
    /// Mouse: Tab selects the active hand, drag moves it, right-drag rotates, wheel changes depth.
    /// </summary>
    public sealed class SimulatedHandInputProvider : IHandInputProvider
    {
        private const float MoveSpeedMps = 0.34f;
        private const float DepthSpeedMps = 0.22f;
        private const float RotationSpeedDegPerSec = 46f;
        private const float PositionSmoothing = 18f;
        private const float GripSmoothing = 11f;
        private const float MouseRotationDegPerPixel = 0.22f;
        private const float ScrollDepthPerUnit = 0.02f;

        private static readonly Bounds Workspace = new Bounds(
            new Vector3(0f, 1.12f, 0f),
            new Vector3(1.25f, 0.65f, 0.7f));

        private readonly Camera camera;

        private HandSide activeHand = HandSide.Left;
        private Vector3 leftTarget;
        private Vector3 rightTarget;
        private Vector3 leftPosition;
        private Vector3 rightPosition;
        private float leftGrip;
        private float rightGrip;
        private float leftYawIntent;
        private float leftPitchIntent;
        private float rightYawIntent;
        private float rightPitchIntent;
        private bool mouseLeftHeldLastFrame;
        private bool mouseRightHeldLastFrame;
        private Vector3 mouseGrabOffset;

        public SimulatedHandInputProvider(Camera camera, Vector3 leftStart, Vector3 rightStart)
        {
            this.camera = camera;
            Reset(leftStart, rightStart);
        }

        public string DisplayName => "SIMULATED (keyboard/mouse)";

        public bool IsAvailable => true;

        public HandSample Left { get; private set; }

        public HandSample Right { get; private set; }

        public HandSide ActiveHand => activeHand;

        public void Reset(Vector3 leftStart, Vector3 rightStart)
        {
            leftTarget = Clamp(leftStart);
            rightTarget = Clamp(rightStart);
            leftPosition = leftTarget;
            rightPosition = rightTarget;
            leftGrip = 0f;
            rightGrip = 0f;
            leftYawIntent = 0f;
            leftPitchIntent = 0f;
            rightYawIntent = 0f;
            rightPitchIntent = 0f;
        }

        public void Poll(float deltaTime)
        {
            if (deltaTime <= 0f)
            {
                return;
            }

            var keyboard = UnityEngine.InputSystem.Keyboard.current;
            var mouse = UnityEngine.InputSystem.Mouse.current;
            if (keyboard == null)
            {
                Left = HandSample.Untracked(HandSide.Left, leftPosition);
                Right = HandSample.Untracked(HandSide.Right, rightPosition);
                return;
            }

            leftYawIntent = 0f;
            leftPitchIntent = 0f;
            rightYawIntent = 0f;
            rightPitchIntent = 0f;

            Vector3 leftDelta = new Vector3(
                (Axis(keyboard.dKey.isPressed) - Axis(keyboard.aKey.isPressed)) * MoveSpeedMps * deltaTime,
                (Axis(keyboard.wKey.isPressed) - Axis(keyboard.sKey.isPressed)) * MoveSpeedMps * deltaTime,
                (Axis(keyboard.eKey.isPressed) - Axis(keyboard.qKey.isPressed)) * DepthSpeedMps * deltaTime);

            Vector3 rightDelta = new Vector3(
                (Axis(keyboard.rightArrowKey.isPressed) - Axis(keyboard.leftArrowKey.isPressed)) * MoveSpeedMps * deltaTime,
                (Axis(keyboard.upArrowKey.isPressed) - Axis(keyboard.downArrowKey.isPressed)) * MoveSpeedMps * deltaTime,
                (Axis(keyboard.periodKey.isPressed) - Axis(keyboard.commaKey.isPressed)) * DepthSpeedMps * deltaTime);

            leftYawIntent = (Axis(keyboard.zKey.isPressed) - Axis(keyboard.xKey.isPressed)) * RotationSpeedDegPerSec * deltaTime;
            leftPitchIntent = (Axis(keyboard.cKey.isPressed) - Axis(keyboard.vKey.isPressed)) * RotationSpeedDegPerSec * deltaTime;
            rightYawIntent = (Axis(keyboard.nKey.isPressed) - Axis(keyboard.mKey.isPressed)) * RotationSpeedDegPerSec * deltaTime;
            rightPitchIntent = (Axis(keyboard.kKey.isPressed) - Axis(keyboard.lKey.isPressed)) * RotationSpeedDegPerSec * deltaTime;

            if (keyboard.tabKey.wasPressedThisFrame)
            {
                activeHand = activeHand == HandSide.Left ? HandSide.Right : HandSide.Left;
            }

            if (mouse != null)
            {
                ApplyMouse(mouse, deltaTime);
            }

            leftTarget = Clamp(leftTarget + leftDelta);
            rightTarget = Clamp(rightTarget + rightDelta);

            float positionBlend = 1f - Mathf.Exp(-PositionSmoothing * deltaTime);
            leftPosition = Vector3.Lerp(leftPosition, leftTarget, positionBlend);
            rightPosition = Vector3.Lerp(rightPosition, rightTarget, positionBlend);

            leftGrip = Mathf.MoveTowards(leftGrip, keyboard.leftShiftKey.isPressed ? 1f : 0f, GripSmoothing * deltaTime);
            rightGrip = Mathf.MoveTowards(rightGrip, keyboard.rightShiftKey.isPressed ? 1f : 0f, GripSmoothing * deltaTime);

            Left = MakeSample(HandSide.Left, leftPosition, leftGrip, leftYawIntent, leftPitchIntent);
            Right = MakeSample(HandSide.Right, rightPosition, rightGrip, rightYawIntent, rightPitchIntent);
        }

        private void ApplyMouse(UnityEngine.InputSystem.Mouse mouse, float deltaTime)
        {
            Vector3 activeTarget = activeHand == HandSide.Left ? leftTarget : rightTarget;
            Vector3 activePosition = activeHand == HandSide.Left ? leftPosition : rightPosition;

            if (mouse.scroll.ReadValue().y != 0f)
            {
                activeTarget = Clamp(activeTarget + Vector3.forward * mouse.scroll.ReadValue().y * ScrollDepthPerUnit * 0.1f);
            }

            if (mouse.leftButton.isPressed)
            {
                var plane = new Plane(Vector3.forward, new Vector3(0f, 0f, activePosition.z));
                Ray ray = camera.ScreenPointToRay(mouse.position.ReadValue());
                if (plane.Raycast(ray, out float distance))
                {
                    Vector3 hit = ray.GetPoint(distance);
                    if (!mouseLeftHeldLastFrame)
                    {
                        mouseGrabOffset = activeTarget - hit;
                    }

                    activeTarget = Clamp(hit + mouseGrabOffset);
                }
            }

            if (mouse.rightButton.isPressed)
            {
                Vector2 mouseDelta = mouse.delta.ReadValue() * MouseRotationDegPerPixel;
                if (activeHand == HandSide.Left)
                {
                    leftYawIntent += mouseDelta.x;
                    leftPitchIntent -= mouseDelta.y;
                }
                else
                {
                    rightYawIntent += mouseDelta.x;
                    rightPitchIntent -= mouseDelta.y;
                }
            }

            mouseLeftHeldLastFrame = mouse.leftButton.isPressed;
            mouseRightHeldLastFrame = mouse.rightButton.isPressed;

            if (activeHand == HandSide.Left)
            {
                leftPosition = activePosition;
                leftTarget = activeTarget;
            }
            else
            {
                rightPosition = activePosition;
                rightTarget = activeTarget;
            }
        }

        private static HandSample MakeSample(HandSide side, Vector3 position, float grip, float yaw, float pitch)
        {
            return new HandSample
            {
                Side = side,
                Tracked = true,
                Position = position,
                Grip = grip,
                YawDeltaDeg = yaw,
                PitchDeltaDeg = pitch,
            };
        }

        private static float Axis(bool pressed) => pressed ? 1f : 0f;

        private static Vector3 Clamp(Vector3 value)
        {
            return new Vector3(
                Mathf.Clamp(value.x, Workspace.min.x, Workspace.max.x),
                Mathf.Clamp(value.y, Workspace.min.y, Workspace.max.y),
                Mathf.Clamp(value.z, Workspace.min.z, Workspace.max.z));
        }
    }
}
