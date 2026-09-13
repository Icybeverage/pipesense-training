using System;
using System.Collections.Generic;
using UnityEngine;

namespace PipeSense.Hands
{
    /// <summary>
    /// MediaPipe landmark indices (21-point hand model) used by the bridge contract.
    /// </summary>
    public static class MediaPipeLandmarks
    {
        public const int Wrist = 0;
        public const int ThumbTip = 4;
        public const int IndexMcp = 5;
        public const int MiddleMcp = 9;
        public const int IndexTip = 8;
        public const int MiddleTip = 12;
        public const int RingTip = 16;
        public const int PinkyTip = 20;
        public const int Count = 21;
    }

    /// <summary>
    /// One frame pushed by a local MediaPipe bridge process. Landmarks are normalized
    /// image coordinates (x, y in 0..1, z relative to wrist depth).
    /// </summary>
    [Serializable]
    public class MediaPipeHandFrame
    {
        public string handedness;
        public float grip = -1f;
        public Landmark[ ] landmarks = Array.Empty<Landmark>();

        [Serializable]
        public class Landmark
        {
            public float x;
            public float y;
            public float z;
        }
    }

    /// <summary>
    /// Documented stub adapter for a future MediaPipe bridge. Nothing here requires a
    /// camera or extra packages: a local bridge process (Python + mediapipe) is expected to
    /// POST/UDP-send JSON frames shaped like MediaPipeHandFrame to a small receiver that
    /// calls EnqueueFrame from any thread. Until such a bridge is wired up, IsAvailable
    /// stays false and the session keeps using the simulated provider.
    ///
    /// Bridge contract (one JSON object per message):
    /// {
    ///   "handedness": "Left" | "Right",
    ///   "grip": 0.0..1.0,            // optional; -1 makes the adapter derive it
    ///   "landmarks": [ { "x": .., "y": .., "z": .. } x 21 ]
    /// }
    ///
    /// Mapping: normalized x/y are mapped into the bench viewport by the delegate set via
    /// SetViewportMapper; z scales depth around the hand's current plane.
    /// </summary>
    public sealed class MediaPipeHandInputProvider : IHandInputProvider
    {
        private const float Staleness_Seconds = 0.25f;
        private const float DepthScaleM = 0.6f;
        private const int MaxFramesPerPoll = 8;

        private readonly object gate = new object();
        private readonly Queue<MediaPipeHandFrame> pending = new Queue<MediaPipeHandFrame>();
        private readonly float[ ] lastSeen = new float[2];
        private readonly HandSample[ ] samples = new HandSample[2];

        private Func<Vector3, HandSide, Vector3> viewportMapper;
        private bool everDelivered;

        public MediaPipeHandInputProvider()
        {
            samples[0] = HandSample.Untracked(HandSide.Left, new Vector3(-0.4f, 1.1f, 0f));
            samples[1] = HandSample.Untracked(HandSide.Right, new Vector3(0.4f, 1.1f, 0f));
        }

        public string DisplayName => "MEDIAPIPE (bridge stub)";

        public bool IsAvailable => everDelivered;

        public HandSample Left => samples[0];

        public HandSample Right => samples[1];

        public void SetViewportMapper(Func<Vector3, HandSide, Vector3> mapper)
        {
            viewportMapper = mapper;
        }

        /// <summary>Thread-safe entry point for a bridge receiver.</summary>
        public void EnqueueFrame(MediaPipeHandFrame frame)
        {
            if (frame == null)
            {
                return;
            }

            lock (gate)
            {
                pending.Enqueue(frame);
            }
        }

        public void Poll(float deltaTime)
        {
            var drained = new List<MediaPipeHandFrame>();
            lock (gate)
            {
                int budget = MaxFramesPerPoll;
                while (budget-- > 0 && pending.Count > 0)
                {
                    drained.Add(pending.Dequeue());
                }
            }

            foreach (MediaPipeHandFrame frame in drained)
            {
                ApplyFrame(frame);
            }

            float now = Time.realtimeSinceStartup;
            for (int i = 0; i < samples.Length; i++)
            {
                if (now - lastSeen[i] <= Staleness_Seconds)
                {
                    continue;
                }

                HandSide side = i == 0 ? HandSide.Left : HandSide.Right;
                if (samples[i].Tracked)
                {
                    samples[i] = HandSample.Untracked(side, samples[i].Position);
                }
            }
        }

        public void Reset(Vector3 leftStart, Vector3 rightStart)
        {
            lock (gate)
            {
                pending.Clear();
            }

            samples[0] = HandSample.Untracked(HandSide.Left, leftStart);
            samples[1] = HandSample.Untracked(HandSide.Right, rightStart);
            lastSeen[0] = float.NegativeInfinity;
            lastSeen[1] = float.NegativeInfinity;
        }

        private void ApplyFrame(MediaPipeHandFrame frame)
        {
            bool isLeft = string.Equals(frame.handedness, "Left", StringComparison.OrdinalIgnoreCase);
            HandSide side = isLeft ? HandSide.Left : HandSide.Right;
            int index = isLeft ? 0 : 1;
            if (frame.landmarks == null || frame.landmarks.Length < MediaPipeLandmarks.Count)
            {
                return;
            }

            Vector3 pivot = samples[index].Position;
            Vector3 normalized = new Vector3(frame.landmarks[MediaPipeLandmarks.MiddleMcp].x, frame.landmarks[MediaPipeLandmarks.MiddleMcp].y, frame.landmarks[MediaPipeLandmarks.MiddleMcp].z);
            Vector3 mapped = viewportMapper != null ? viewportMapper(normalized, side) : pivot;
            mapped.z += normalized.z * DepthScaleM;

            samples[index] = new HandSample
            {
                Side = side,
                Tracked = true,
                Position = mapped,
                Grip = frame.grip >= 0f ? Mathf.Clamp01(frame.grip) : GripFromLandmarks(frame.landmarks),
                YawDeltaDeg = 0f,
                PitchDeltaDeg = 0f,
            };
            lastSeen[index] = Time.realtimeSinceStartup;
            everDelivered = true;
        }

        /// <summary>Thumb-tip to index-tip distance relative to palm width; 1 = closed fist.</summary>
        public static float GripFromLandmarks(MediaPipeHandFrame.Landmark[ ] landmarks)
        {
            if (landmarks == null || landmarks.Length < MediaPipeLandmarks.Count)
            {
                return 0f;
            }

            MediaPipeHandFrame.Landmark wrist = landmarks[MediaPipeLandmarks.Wrist];
            MediaPipeHandFrame.Landmark indexMcp = landmarks[MediaPipeLandmarks.IndexMcp];
            MediaPipeHandFrame.Landmark pinkyMcp = landmarks[MediaPipeLandmarks.PinkyTip];
            MediaPipeHandFrame.Landmark thumbTip = landmarks[MediaPipeLandmarks.ThumbTip];
            MediaPipeHandFrame.Landmark indexTip = landmarks[MediaPipeLandmarks.IndexTip];

            float palmWidth = Distance(indexMcp, pinkyMcp);
            if (palmWidth < 1e-5f)
            {
                return 0f;
            }

            float pinch = Distance(thumbTip, indexTip);
            float normalized = pinch / palmWidth;
            return Mathf.Clamp01(1f - (normalized / 1.6f));
        }

        private static float Distance(MediaPipeHandFrame.Landmark a, MediaPipeHandFrame.Landmark b)
        {
            float dx = a.x - b.x;
            float dy = a.y - b.y;
            float dz = a.z - b.z;
            return Mathf.Sqrt((dx * dx) + (dy * dy) + (dz * dz));
        }
    }
}
