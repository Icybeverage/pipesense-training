using UnityEngine;

namespace PipeSense.Hands
{
    public enum HandSide
    {
        Left,
        Right,
    }

    /// <summary>
    /// One tracked hand this frame. Translation deltas are applied by the session;
    /// Yaw/Pitch deltas are rotation intents for the pipe currently held by the hand.
    /// </summary>
    public struct HandSample
    {
        public HandSide Side;
        public bool Tracked;
        public Vector3 Position;
        public float Grip;
        public float YawDeltaDeg;
        public float PitchDeltaDeg;

        public bool GripClosed => Grip >= 0.6f;

        public static HandSample Untracked(HandSide side, Vector3 fallback)
        {
            return new HandSample
            {
                Side = side,
                Tracked = false,
                Position = fallback,
                Grip = 0f,
                YawDeltaDeg = 0f,
                PitchDeltaDeg = 0f,
            };
        }
    }

    /// <summary>
    /// Gesture input boundary. The keyboard/mouse simulation and any future MediaPipe
    /// bridge implement this interface, so the training session never depends on a camera.
    /// </summary>
    public interface IHandInputProvider
    {
        string DisplayName { get; }

        /// <summary>True once the provider can deliver plausible samples.</summary>
        bool IsAvailable { get; }

        HandSample Left { get; }

        HandSample Right { get; }

        void Poll(float deltaTime);

        void Reset(Vector3 leftStart, Vector3 rightStart);
    }
}
