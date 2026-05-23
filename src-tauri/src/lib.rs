// v1 shell: no plugins, no invoke handlers. The WebView loads the bundled
// Next.js static export and talks to the deployed Azure Functions backend
// over HTTPS. Crypto, storage, and AI all stay in JavaScript.
//
// Future specs (Stronghold-backed key cache, updater plugin) register
// plugins and `invoke` commands here.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
