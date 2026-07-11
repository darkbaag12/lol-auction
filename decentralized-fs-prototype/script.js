document.addEventListener('DOMContentLoaded', () => {
    // Drag and drop zone interaction
    const dropZone = document.getElementById('drop-zone');

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });

    function highlight(e) {
        dropZone.classList.add('dragover');
    }

    function unhighlight(e) {
        dropZone.classList.remove('dragover');
    }

    dropZone.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        let dt = e.dataTransfer;
        let files = dt.files;

        if (files.length > 0) {
            // Just simulate a successful upload visually for the prototype
            const originalHtml = dropZone.innerHTML;
            
            dropZone.innerHTML = `
                <div class="upload-icon" style="color: var(--accent-green)">
                    <i class="fa-solid fa-circle-check"></i>
                </div>
                <h3 style="color: var(--accent-green)">File Encrypted & Sharded!</h3>
                <p>CID: Qm${Math.random().toString(36).substring(2, 10)}...${Math.random().toString(36).substring(2, 6)}</p>
            `;
            
            setTimeout(() => {
                dropZone.innerHTML = originalHtml;
            }, 3000);
        }
    }
});
