// Prevents an additional console window on Windows in release builds.
// Harmless on macOS but kept so the crate stays portable if a future spec
// adds a Windows target.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    wrapped_for_work_lib::run()
}
