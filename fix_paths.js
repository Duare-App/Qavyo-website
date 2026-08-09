const fs = require('fs');
const path = require('path');

const indexHtmlPath = path.join(__dirname, 'index.html');
const imagesDirPath = path.join(__dirname, 'Qavyo-images');

// Read index.html
let html = fs.readFileSync(indexHtmlPath, 'utf-8');

// Read all filenames from Qavyo-images
const imageFiles = fs.readdirSync(imagesDirPath);

// For each image file, find its occurrences in the HTML and replace the path
let replacedCount = 0;

imageFiles.forEach(file => {
    // Ignore .DS_Store or non-asset files
    if (file === '.DS_Store' || file === 'download.htm') return;
    
    // We want to replace paths like /_resources/.../filename.png with Qavyo-images/filename.png
    // Or https://www.eposnow.com/.../filename.png with Qavyo-images/filename.png
    // The regex looks for any URL-like string ending in the filename (handling quotes or parentheses for CSS url())
    
    // Escape regex characters in filename
    const escapedFile = file.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    
    // Match href=", src=", or url() containing the filename
    // Example matches: src="/_resources/themes/default/dist/images/logo-navy.svg"
    // We capture the prefix (src=", url(, etc.) and replace the inner path
    const regex = new RegExp(`(src=["']|href=["']|url\\(['"]?)(?:[^"'{})]*?/)?(${escapedFile})(['"]?\\)?)`, 'g');
    
    html = html.replace(regex, (match, prefix, filename, suffix) => {
        replacedCount++;
        // Reconstruct the attribute/url with the local path
        if (suffix === undefined) suffix = '';
        return `${prefix}Qavyo-images/${filename}${suffix}`;
    });
});

fs.writeFileSync(indexHtmlPath, html, 'utf-8');
console.log(`Successfully updated ${replacedCount} image paths to point to Qavyo-images locally!`);
