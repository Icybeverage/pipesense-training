using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace PipeSense.Editor
{
    public static class PipeSenseSceneBuilder
    {
        [MenuItem("PipeSense/Build Demo Scene")]
        public static void Build()
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
            new GameObject("PipeSense Demo").AddComponent<PipeSenseDemo>();
            const string path = "Assets/Scenes/PipeSenseDemo.unity";
            EditorSceneManager.SaveScene(scene, path);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(path, true) };
            AssetDatabase.SaveAssets();
            Debug.Log($"Built {path}");
        }
    }
}

