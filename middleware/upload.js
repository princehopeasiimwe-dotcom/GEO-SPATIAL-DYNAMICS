const multer = require('multer');
const path = require('path');
const supabase = require('../db/supabase');


// ============================================================
// MULTER
// ============================================================

const storage = multer.memoryStorage();


// ============================================================
// IMAGE FILTER
// ============================================================

function fileFilter(req, file, cb) {

  const allowed = [
    '.jpg',
    '.jpeg',
    '.png',
    '.webp'
  ];

  const ext = path
    .extname(file.originalname)
    .toLowerCase();

  if (allowed.includes(ext)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        'Only JPG, PNG, and WEBP images are allowed'
      )
    );
  }
}


// ============================================================
// MULTER CONFIGURATION
// ============================================================

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});


// ============================================================
// SUPABASE STORAGE UPLOAD
// ============================================================

async function uploadToSupabase(req, res, next) {

  try {

    // No file uploaded
    if (!req.file) {
      return next();
    }

    const ext = path
      .extname(req.file.originalname)
      .toLowerCase();

    const safeName =
      `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;

    const filePath = `uploads/${safeName}`;

    const { error } = await supabase.storage
      .from('site-images')
      .upload(
        filePath,
        req.file.buffer,
        {
          contentType: req.file.mimetype,
          upsert: false
        }
      );

    if (error) {

      console.error(
        'Supabase Storage upload error:',
        error
      );

      return res.status(500).send(
        `<pre>Image upload failed:\n\n${error.message}</pre>`
      );
    }

    const {
      data: publicUrlData
    } = supabase.storage
      .from('site-images')
      .getPublicUrl(filePath);

    const publicUrl =
      publicUrlData.publicUrl;

    // Keep compatibility with existing routes
    req.file.filename = safeName;
    req.file.path = filePath;
    req.file.publicUrl = publicUrl;

    next();

  } catch (error) {

    console.error(
      'Supabase image middleware error:',
      error
    );

    res.status(500).send(
      `<pre>Image upload failed:\n\n${error.stack}</pre>`
    );
  }
}


// ============================================================
// MULTIPLE FILE UPLOAD
// ============================================================

async function uploadFieldsToSupabase(req, res, next) {

  try {

    if (!req.files) {
      return next();
    }

    for (const field of Object.keys(req.files)) {

      const files = req.files[field];

      for (const file of files) {

        const ext = path
          .extname(file.originalname)
          .toLowerCase();

        const safeName =
          `${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;

        const filePath =
          `uploads/${safeName}`;

        const { error } = await supabase.storage
          .from('site-images')
          .upload(
            filePath,
            file.buffer,
            {
              contentType: file.mimetype,
              upsert: false
            }
          );

        if (error) {

          console.error(
            'Supabase Storage upload error:',
            error
          );

          return res.status(500).send(
            `<pre>Image upload failed:\n\n${error.message}</pre>`
          );
        }

        const {
          data: publicUrlData
        } = supabase.storage
          .from('site-images')
          .getPublicUrl(filePath);

        file.filename = safeName;
        file.path = filePath;
        file.publicUrl =
          publicUrlData.publicUrl;
      }
    }

    next();

  } catch (error) {

    console.error(
      'Supabase multiple image upload error:',
      error
    );

    res.status(500).send(
      `<pre>Image upload failed:\n\n${error.stack}</pre>`
    );
  }
}


// ============================================================
// SUPABASE STORAGE DELETE
// ============================================================
//
// Accepts:
//
// 1. Supabase storage path:
//    uploads/image.jpg
//
// 2. Supabase public URL:
//    https://xxxxx.supabase.co/storage/v1/object/public/site-images/uploads/image.jpg
//
// 3. Old local-style path:
//    /uploads/image.jpg
//
// Returns true when deletion succeeds.
// Returns false when there is nothing to delete.
//

async function deleteFromSupabase(filePath) {

  try {

    if (!filePath) {
      return false;
    }

    let storagePath = filePath;

    // --------------------------------------------------------
    // FULL SUPABASE PUBLIC URL
    // --------------------------------------------------------

    if (storagePath.startsWith('http://') ||
        storagePath.startsWith('https://')) {

      try {

        const url = new URL(storagePath);

        const marker =
          '/storage/v1/object/public/site-images/';

        const index =
          url.pathname.indexOf(marker);

        if (index !== -1) {

          storagePath =
            url.pathname.substring(
              index + marker.length
            );

          storagePath =
            decodeURIComponent(storagePath);
        }

      } catch (urlError) {

        console.error(
          'Invalid Supabase image URL:',
          storagePath
        );

        return false;
      }
    }


    // --------------------------------------------------------
    // OLD /uploads/... FORMAT
    // --------------------------------------------------------

    if (storagePath.startsWith('/uploads/')) {
      storagePath =
        storagePath.substring('/'.length);
    }


    // --------------------------------------------------------
    // uploads/... FORMAT
    // --------------------------------------------------------

    if (!storagePath.startsWith('uploads/')) {

      storagePath =
        `uploads/${storagePath}`;
    }


    // --------------------------------------------------------
    // DELETE FROM SUPABASE STORAGE
    // --------------------------------------------------------

    const { error } =
      await supabase.storage
        .from('site-images')
        .remove([storagePath]);

    if (error) {

      console.error(
        'Supabase Storage delete error:',
        error
      );

      return false;
    }

    console.log(
      'Deleted Supabase image:',
      storagePath
    );

    return true;

  } catch (error) {

    console.error(
      'deleteFromSupabase error:',
      error
    );

    return false;
  }
}


// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  upload,
  uploadToSupabase,
  uploadFieldsToSupabase,
  deleteFromSupabase
};
