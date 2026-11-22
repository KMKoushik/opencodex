//! LaunchServices fallback for applications without a declared .icns resource.
//! Called on the Open-in discovery worker, never in a view or input handler.
pub fn png(bundle: &std::path::Path) -> Option<Vec<u8>> {
    #[cfg(target_os = "macos")]
    {
        use objc2::AnyThread;
        use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSWorkspace};
        use objc2_foundation::{NSDictionary, NSString};
        objc2::rc::autoreleasepool(|_| {
            let image =
                NSWorkspace::sharedWorkspace().iconForFile(&NSString::from_str(bundle.to_str()?));
            let tiff = image.TIFFRepresentation()?;
            let bitmap = NSBitmapImageRep::initWithData(NSBitmapImageRep::alloc(), &tiff)?;
            let bytes = unsafe {
                bitmap.representationUsingType_properties(
                    NSBitmapImageFileType::PNG,
                    &NSDictionary::new(),
                )?
            };
            Some(bytes.to_vec())
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = bundle;
        None
    }
}
