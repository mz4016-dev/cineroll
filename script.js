let images = [], deletedBin = [];
let stream = null, mediaRecorder = null, recordedChunks = [];
let facingMode = 'user', camMode = 'photo', isRecording = false;
let lbScale = 1;

const $ = id => document.getElementById(id);

const filmFC    = $('filmFramesContainer');
const fileInput = $('fileInput');
const uploadZone= $('uploadZone');
const cameraView= $('cameraView');
const liveVideo = $('liveVideo');
const snapCanvas= $('snapCanvas');

// ── Upload zone ───────────────────────────────────────────────────────────────
uploadZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => { addImages(e.target.files); fileInput.value=''; });
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => { e.preventDefault(); uploadZone.classList.remove('drag-over'); addImages(e.dataTransfer.files); });

// ── Shutter → open webcam ─────────────────────────────────────────────────────
$('shutterBtn').addEventListener('click', openCamera);

async function openCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode }, audio:true });
        liveVideo.srcObject = stream;
        uploadZone.style.display = 'none';
        cameraView.style.display = 'block';
    } catch(err) {
        alert('Camera access denied.\nPlease allow camera permissions in your browser and try again.');
    }
}

function stopCamera() {
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    liveVideo.srcObject = null;
    cameraView.style.display = 'none';
    uploadZone.style.display = 'flex';
    if (isRecording) stopRecording();
}

$('closeCamBtn').addEventListener('click', stopCamera);

$('switchCamBtn').addEventListener('click', async () => {
    facingMode = facingMode === 'user' ? 'environment' : 'user';
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode }, audio:true });
    liveVideo.srcObject = stream;
});

// ── Mode toggle ───────────────────────────────────────────────────────────────
$('photoModeBtn').addEventListener('click', () => setMode('photo'));
$('videoModeBtn').addEventListener('click', () => setMode('video'));

function setMode(m) {
    camMode = m;
    const pb = $('photoModeBtn'), vb = $('videoModeBtn'), sb = $('snapBtn');
    if (m === 'photo') {
        pb.style.cssText = 'background:#fff;color:#000;';
        vb.style.cssText = 'background:transparent;color:#fff;';
        sb.style.background = '#fff'; sb.style.border = '4px solid #ccc';
        sb.innerHTML = '';
        if (isRecording) stopRecording();
    } else {
        vb.style.cssText = 'background:#ff3b2f;color:#fff;';
        pb.style.cssText = 'background:transparent;color:#fff;';
        sb.style.background = '#ff3b2f'; sb.style.border = '4px solid #ff8c80';
    }
}

// ── Snap / Record ─────────────────────────────────────────────────────────────
$('snapBtn').addEventListener('click', () => {
    if (camMode === 'photo') takePhoto();
    else if (!isRecording) startRecording();
    else stopRecording();
});

function takePhoto() {
    const MAX = 500;
    const vw = liveVideo.videoWidth, vh = liveVideo.videoHeight;
    const scale = Math.min(MAX / vw, MAX / vh, 1);
    snapCanvas.width  = Math.round(vw * scale);
    snapCanvas.height = Math.round(vh * scale);
    snapCanvas.getContext('2d').drawImage(liveVideo, 0, 0, snapCanvas.width, snapCanvas.height);
    const dataUrl = snapCanvas.toDataURL('image/jpeg', 0.65);
    flashScreen();
    images.push({ id: uid(), dataUrl, date: new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) });
    save(); renderFilmStrip();
}

function startRecording() {
    recordedChunks = [];
    const opts = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? { mimeType:'video/webm;codecs=vp9' } : { mimeType:'video/webm' };
    mediaRecorder = new MediaRecorder(stream, opts);
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = saveVideo;
    mediaRecorder.start();
    isRecording = true;
    $('recIndicator').style.display = 'block';
    $('snapBtn').innerHTML = '<div style="width:18px;height:18px;background:#fff;border-radius:3px"></div>';
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    isRecording = false;
    $('recIndicator').style.display = 'none';
    $('snapBtn').innerHTML = '';
}

function saveVideo() {
    const blob = new Blob(recordedChunks, { type:'video/webm' });
    const url  = URL.createObjectURL(blob);
    videoThumb(url, thumb => {
        images.push({ id:uid(), dataUrl:thumb, videoUrl:url, isVideo:true });
        save(); renderFilmStrip();
    });
}

function videoThumb(url, cb) {
    const v = document.createElement('video');
    v.src = url; v.muted = true; v.currentTime = 0.5;
    v.addEventListener('seeked', () => {
        const MAX = 500;
        const vw = v.videoWidth, vh = v.videoHeight;
        const scale = Math.min(MAX / vw, MAX / vh, 1);
        const c = document.createElement('canvas');
        c.width  = Math.round(vw * scale);
        c.height = Math.round(vh * scale);
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        cb(c.toDataURL('image/jpeg', 0.65));
    }, { once:true });
    v.load();
}

function flashScreen() {
    const f = document.createElement('div');
    f.className = 'shutter-flash';
    document.body.appendChild(f);
    f.addEventListener('animationend', () => f.remove());
}

// ── Trash ─────────────────────────────────────────────────────────────────────
$('clearAllBtn').addEventListener('click', () => {
    if (!images.length) return;
    if (confirm('Delete all photos from the film tape?')) {
        deletedBin = [...deletedBin, ...images];
        images = []; save(); renderFilmStrip(); updateBadge();
    }
});

// ── Menu  ────────────────────────────────────────────────────────────────
$('menuBtn').addEventListener('click', openModal);
$('closeModalBtn').addEventListener('click', closeModal);
$('modalOverlay').addEventListener('click', e => { if (e.target===$('modalOverlay')) closeModal(); });
$('restoreAllBtn').addEventListener('click', () => {
    if (!deletedBin.length) return;
    images = [...images, ...deletedBin]; deletedBin = [];
    save(); renderFilmStrip(); renderModal(); updateBadge();
});
$('clearBinBtn').addEventListener('click', () => {
    if (!deletedBin.length) return;
    if (confirm('Permanently delete all? Cannot be undone.')) {
        deletedBin = []; save(); renderModal(); updateBadge();
    }
});

function openModal()  { renderModal(); $('modalOverlay').classList.add('open'); }
function closeModal() { $('modalOverlay').classList.remove('open'); }

function updateBadge() {
    const btn = $('menuBtn');
    if (deletedBin.length) { btn.classList.add('has-deleted'); btn.title=`${deletedBin.length} in bin`; }
    else { btn.classList.remove('has-deleted'); btn.title=''; }
}

function renderModal() {
    $('deletedCount').textContent = deletedBin.length;
    const body = $('modalBody');
    if (!deletedBin.length) { body.innerHTML='<div class="modal-empty"><p>Bin is empty</p></div>'; return; }
    const grid = document.createElement('div');
    grid.className = 'deleted-grid';
    deletedBin.forEach((img, i) => {
        const card = document.createElement('div');
        card.className = 'deleted-card';
        card.innerHTML = `<img src="${img.dataUrl}" alt="Deleted ${i+1}">
            <div class="deleted-card-actions">
                <button class="card-btn restore" data-id="${img.id}">↩ Restore</button>
                <button class="card-btn perm-delete" data-id="${img.id}">✕</button>
            </div>`;
        grid.appendChild(card);
    });
    body.innerHTML=''; body.appendChild(grid);
    grid.querySelectorAll('.restore').forEach(btn => btn.addEventListener('click', () => {
        const idx = deletedBin.findIndex(x => String(x.id)===btn.dataset.id);
        if (idx===-1) return;
        images.push(deletedBin[idx]); deletedBin.splice(idx,1);
        save(); renderFilmStrip(); renderModal(); updateBadge();
    }));
    grid.querySelectorAll('.perm-delete').forEach(btn => btn.addEventListener('click', () => {
        deletedBin = deletedBin.filter(x => String(x.id)!==btn.dataset.id);
        save(); renderModal(); updateBadge();
    }));
}

// ── Lightbox ──────────────────────────────────────────────────────────────────
function openLightbox(imgData) {
    lbScale = 1;
    const lbp = $('lightboxPhoto'), lbv = $('lightboxVideo');
    lbp.style.transform = 'scale(1)'; lbp.classList.remove('zoomed');
    if (imgData.isVideo && imgData.videoUrl) {
        lbp.style.display = 'none'; lbv.style.display = 'block';
        lbv.src = imgData.videoUrl; lbv.play();
        $('lightboxHint').textContent = '';
    } else {
        lbv.style.display = 'none'; lbv.pause(); lbv.src = '';
        lbp.style.display = 'block'; lbp.src = imgData.dataUrl;
        $('lightboxHint').textContent = 'Click to zoom · Scroll to zoom · Click again to reset';
    }
    $('lightboxOverlay').classList.add('open');
}

function closeLightbox() {
    $('lightboxOverlay').classList.remove('open');
    const lbv = $('lightboxVideo'); lbv.pause(); lbv.src = '';
    $('lightboxPhoto').src = '';
}

$('lightboxClose').addEventListener('click', closeLightbox);
$('lightboxOverlay').addEventListener('click', e => { if (e.target===$('lightboxOverlay')) closeLightbox(); });
document.addEventListener('keydown', e => { if (e.key==='Escape') closeLightbox(); });

$('lightboxPhoto').addEventListener('click', e => {
    const lbp = $('lightboxPhoto');
    if (lbScale === 1) {
        const r = lbp.getBoundingClientRect();
        const ox = ((e.clientX-r.left)/r.width)*100;
        const oy = ((e.clientY-r.top)/r.height)*100;
        lbp.style.transformOrigin = `${ox}% ${oy}%`;
        lbScale = 2.5; lbp.classList.add('zoomed');
    } else {
        lbScale = 1; lbp.style.transformOrigin = 'center center'; lbp.classList.remove('zoomed');
    }
    lbp.style.transform = `scale(${lbScale})`;
});

$('lightboxPhoto').addEventListener('wheel', e => {
    e.preventDefault();
    const lbp = $('lightboxPhoto');
    lbScale = Math.min(5, Math.max(1, lbScale - e.deltaY*0.002));
    lbp.style.transform = `scale(${lbScale})`;
    if (lbScale<=1) { lbp.classList.remove('zoomed'); lbp.style.transformOrigin='center center'; }
    else lbp.classList.add('zoomed');
}, { passive:false });

// ── Film strip render ─────────────────────────────────────────────────────────
function renderFilmStrip() {
    filmFC.innerHTML = '';
    if (!images.length) {
        for (let i=0;i<4;i++) { const f=document.createElement('div'); f.className='film-frame'; filmFC.appendChild(f); }
    } else {
        images.forEach((imgData, i) => {
            const frame = document.createElement('div');
            frame.className = 'film-frame';
            frame.title = imgData.isVideo ? 'Click to play' : 'Click to zoom';

            // main content
            if (imgData.isVideo) {
                const thumb = document.createElement('img');
                thumb.src = imgData.dataUrl; thumb.className='vid-thumb'; thumb.alt=`Video ${i+1}`;
                const badge = document.createElement('div');
                badge.className = 'vid-badge';
                badge.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M5 3l14 9-14 9V3z"/></svg>';
                frame.appendChild(thumb); frame.appendChild(badge);
            } else {
                const img = document.createElement('img');
                img.src = imgData.dataUrl; img.alt=`Photo ${i+1}`;
                frame.appendChild(img);
            }

            // date stamp
            if (imgData.date) {
                const stamp = document.createElement('div');
                stamp.className = 'date-stamp';
                stamp.textContent = imgData.date;
                frame.appendChild(stamp);
            }

            // hover action bar
            const actions = document.createElement('div');
            actions.className = 'frame-actions';

            // download btn
            const dlBtn = document.createElement('button');
            dlBtn.className = 'frame-btn';
            dlBtn.innerHTML = '⬇ Save';
            dlBtn.title = 'Download';
            dlBtn.addEventListener('click', e => { e.stopPropagation(); downloadFrame(imgData); });

            // filter btn (photos only)
            const filterBtn = document.createElement('button');
            filterBtn.className = 'frame-btn';
            filterBtn.innerHTML = '🎨 Filter';
            filterBtn.title = 'Apply filter';
            filterBtn.addEventListener('click', e => { e.stopPropagation(); openFilterModal(imgData, i); });

            // delete btn
            const delBtn = document.createElement('button');
            delBtn.className = 'frame-btn del-btn';
            delBtn.innerHTML = '✕';
            delBtn.title = 'Delete';
            delBtn.addEventListener('click', e => {
                e.stopPropagation();
                deletedBin.push(images[i]);
                images.splice(i, 1);
                save(); renderFilmStrip(); updateBadge();
            });

            actions.appendChild(dlBtn);
            if (!imgData.isVideo) actions.appendChild(filterBtn);
            actions.appendChild(delBtn);
            frame.appendChild(actions);

            // click main area = lightbox
            frame.addEventListener('click', () => openLightbox(imgData));
            filmFC.appendChild(frame);
        });
    }
    const banner = document.createElement('div');
    banner.className = 'film-text-area';
    banner.innerHTML = `<h2 contenteditable="true">PREMIER PARTY:</h2>
        <h3 contenteditable="true">CAMERA ROLL</h3>
        <p contenteditable="true">SMILE!</p>`;
    filmFC.appendChild(banner);
    if (images.length) setTimeout(() => filmFC.scrollTo({top:filmFC.scrollHeight,behavior:'smooth'}), 60);
}

// ── Compress & add from file picker ──────────────────────────────────────────
function addImages(files) {
    const imgs = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (!imgs.length) return;
    let done=0; const newImgs=[];
    imgs.forEach(file => {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                const MAX=500, scale=Math.min(MAX/img.width,MAX/img.height,1);
                const c=document.createElement('canvas');
                c.width=Math.round(img.width*scale); c.height=Math.round(img.height*scale);
                c.getContext('2d').drawImage(img,0,0,c.width,c.height);
                newImgs.push({ id:uid(), dataUrl:c.toDataURL('image/jpeg',.65), date: new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) });
                if (++done===imgs.length) { images=[...images,...newImgs]; save(); renderFilmStrip(); }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// ── Storage ───────────────────────────────────────────────────────────────────
function save() {
    try { localStorage.setItem('cr',JSON.stringify(images)); localStorage.setItem('crb',JSON.stringify(deletedBin)); }
    catch(e) { console.warn('Storage full',e); }
}
function load() {
    try {
        const s=localStorage.getItem('cr'), b=localStorage.getItem('crb');
        if(s) images=JSON.parse(s);
        if(b) deletedBin=JSON.parse(b);
    } catch(e){}
    renderFilmStrip(); updateBadge();
}


// ── Slideshow ─────────────────────────────────────────────────────────────────
let ssIndex = 0, ssTimer = null, ssPlaying = false;
const SS_INTERVAL = 2500; // ms per photo

const playBtn         = $('playBtn');
const slideshowOverlay= $('slideshowOverlay');
const slideshowImg    = $('slideshowImg');
const slideshowVideo  = $('slideshowVideoEl');
const slideshowCounter= $('slideshowCounter');
const ssDots          = $('ssDots');

playBtn.addEventListener('click', () => {
    if (!images.length) { alert('Add some photos first!'); return; }
    if (stream) stopCamera();
    ssIndex = 0;
    openSlideshow();
});

// d-pad controls
$('navLeft').addEventListener('click', () => {
    if (slideshowOverlay.classList.contains('open')) { ssStep(-1); }
});
$('navRight').addEventListener('click', () => {
    if (slideshowOverlay.classList.contains('open')) { ssStep(1); }
});
$('navDown').addEventListener('click', () => {
    if (slideshowOverlay.classList.contains('open')) { closeSlideshow(); }
});

// keyboard arrows
document.addEventListener('keydown', e => {
    if (!slideshowOverlay.classList.contains('open')) return;
    if (e.key === 'ArrowRight') ssStep(1);
    if (e.key === 'ArrowLeft')  ssStep(-1);
    if (e.key === 'Escape')     closeSlideshow();
});

function openSlideshow() {
    uploadZone.style.display = 'none';
    cameraView.style.display = 'none';
    slideshowOverlay.classList.add('open');
    playBtn.classList.add('playing');
    document.querySelector('.nav-circle').classList.add('ss-active');
    ssPlaying = true;
    renderSlide();
    startAutoPlay();
}

function closeSlideshow() {
    slideshowOverlay.classList.remove('open');
    uploadZone.style.display = 'flex';
    playBtn.classList.remove('playing');
    document.querySelector('.nav-circle').classList.remove('ss-active');
    ssPlaying = false;
    clearTimeout(ssTimer);
    slideshowVideo.pause();
    slideshowVideo.src = '';
}

function renderSlide() {
    const imgData = images[ssIndex];
    // update counter
    slideshowCounter.textContent = `${ssIndex + 1} / ${images.length}`;
    // update dots
    buildDots();

    // reset both
    slideshowImg.style.display = 'none';
    slideshowVideo.style.display = 'none';
    slideshowVideo.pause();

    if (imgData.isVideo && imgData.videoUrl) {
        slideshowVideo.src = imgData.videoUrl;
        slideshowVideo.style.display = 'block';
        slideshowVideo.play();
    } else {
        slideshowImg.src = imgData.dataUrl;
        slideshowImg.style.animation = 'none';
        slideshowImg.offsetHeight; 
        slideshowImg.style.animation = '';
        slideshowImg.style.display = 'block';
    }
}

function buildDots() {
    ssDots.innerHTML = '';

    if (images.length <= 12) {
        images.forEach((_, i) => {
            const dot = document.createElement('div');
            dot.className = 'ss-dot' + (i === ssIndex ? ' active' : '');
            dot.addEventListener('click', () => { ssIndex = i; renderSlide(); resetAutoPlay(); });
            ssDots.appendChild(dot);
        });
    }
}

function ssStep(dir) {
    ssIndex = (ssIndex + dir + images.length) % images.length;
    renderSlide();
    resetAutoPlay();
}

function startAutoPlay() {
    clearTimeout(ssTimer);
    ssTimer = setTimeout(() => {
        if (!ssPlaying) return;
        ssStep(1);
        startAutoPlay();
    }, SS_INTERVAL);
}

function resetAutoPlay() {
    clearTimeout(ssTimer);
    startAutoPlay();
}


// ── Download frame ────────────────────────────────────────────────────────────
function downloadFrame(imgData) {
    const a = document.createElement('a');
    a.href = imgData.videoUrl || imgData.dataUrl;
    a.download = imgData.isVideo ? 'video.webm' : 'photo.jpg';
    a.click();
}

// ── Filters ───────────────────────────────────────────────────────────────────
const FILTERS = [
    { name:'Original', css:'none' },
    { name:'B&W',      css:'grayscale(100%)' },
    { name:'Vintage',  css:'sepia(80%) contrast(90%) brightness(110%)' },
    { name:'Warm',     css:'saturate(130%) hue-rotate(-15deg) brightness(105%)' },
    { name:'Cool',     css:'saturate(110%) hue-rotate(20deg) brightness(105%)' },
    { name:'Fade',     css:'opacity(85%) brightness(115%) contrast(85%)' },
    { name:'Vivid',    css:'saturate(180%) contrast(110%)' },
    { name:'Drama',    css:'contrast(130%) brightness(90%) saturate(80%)' },
];

let filterTargetIndex = -1, filterSelectedIndex = 0;

function openFilterModal(imgData, idx) {
    filterTargetIndex = idx;
    filterSelectedIndex = 0;
    const preview = $('filterPreview');
    preview.src = imgData.dataUrl;
    preview.style.filter = 'none';
    buildFilterGrid(imgData.dataUrl);
    $('filterModalOverlay').classList.add('open');
}

function buildFilterGrid(src) {
    const grid = $('filterGrid');
    grid.innerHTML = '';
    FILTERS.forEach((f, i) => {
        const opt = document.createElement('div');
        opt.className = 'filter-opt' + (i === filterSelectedIndex ? ' active' : '');
        const img = document.createElement('img');
        img.src = src; img.style.filter = f.css;
        const label = document.createElement('span');
        label.textContent = f.name;
        opt.appendChild(img); opt.appendChild(label);
        opt.addEventListener('click', () => {
            filterSelectedIndex = i;
            $('filterPreview').style.filter = f.css;
            grid.querySelectorAll('.filter-opt').forEach((o,j) => o.classList.toggle('active', j===i));
        });
        grid.appendChild(opt);
    });
}

$('filterModalClose').addEventListener('click', () => $('filterModalOverlay').classList.remove('open'));
$('filterModalOverlay').addEventListener('click', e => { if (e.target===$('filterModalOverlay')) $('filterModalOverlay').classList.remove('open'); });

$('filterApplyBtn').addEventListener('click', () => {
    if (filterTargetIndex < 0) return;
    const imgData = images[filterTargetIndex];
    const f = FILTERS[filterSelectedIndex];
    if (f.css === 'none') { $('filterModalOverlay').classList.remove('open'); return; }

    // bake filter into canvas
    const img = new Image();
    img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.filter = f.css;
        ctx.drawImage(img, 0, 0);
        images[filterTargetIndex] = { ...imgData, dataUrl: c.toDataURL('image/jpeg', 0.85) };
        save(); renderFilmStrip();
        $('filterModalOverlay').classList.remove('open');
    };
    img.src = imgData.dataUrl;
});

function uid() { return Date.now()+Math.random(); }

load();