// =============================================
// PARTÍCULAS
// =============================================
const particlesContainer = document.getElementById('particles');
for (let i = 0; i < 30; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.width = Math.random() * 5 + 2 + 'px';
    particle.style.height = particle.style.width;
    particle.style.left = Math.random() * 100 + '%';
    particle.style.animationDuration = Math.random() * 10 + 10 + 's';
    particle.style.animationDelay = Math.random() * 5 + 's';
    particlesContainer.appendChild(particle);
}

// =============================================
// ARRAY DE GIFS DE MEMES
// =============================================
const memeGifs = [
    'https://media.giphy.com/media/3o7btPCcdNniyf0ArS/giphy.gif',
    'https://media.giphy.com/media/l3q2K5jinAlChoCLS/giphy.gif',
    'https://media.giphy.com/media/QBd2kLB5qDmysEXre9/giphy.gif',
    'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif',
    'https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExMXoyOG8zYzZ6c3RqMnc3cnEwYWhqMDB3a2JyNm82ZmN6YTBxc3d3biZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/C840F45mSTyyhSiH8w/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3M2Rwc3Blb3EwNGptNHhyaTJvcHg0NGdmOXNpcTN6c2RkYWlvb3U1ZCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/XjleBVaSwAo11ERAxn/giphy.gif',
    'https://media.giphy.com/media/3o7aCRloybJlXpNjSU/giphy.gif',
    'https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3OWoyaHQ4Z2hidXlseW9zcDFodmoyM3JiZGt5ZmRibzZ6OGVienh2NCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/xTiTnHvXHHxOTcdmxO/giphy.gif',
    'https://media.giphy.com/media/Lopx9eUi34rbq/giphy.gif',
    'https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExcHRpZzNoOGE5dmV2NnR1NWN3MGRhdWQ4NXFqYmpjbTZsbjA4NWRhaSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/MOYUOOoIHOj9PKN1rE/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3bjI5bnhrbTdtemlqcWVoeW0wYzl1Z2hhMmM2Z3gzeHJ4M2k1aGxibyZlcD12MV9naWZzX3RyZW5kaW5nJmN0PWc/ASd0Ukj0y3qMM/giphy.gif'
];

const getRandomMeme = () => memeGifs[Math.floor(Math.random() * memeGifs.length)];

// =============================================
// NAVBAR SCROLL
// =============================================
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 50);
});

// =============================================
// SISTEMA DE GALERÍA
// =============================================
let currentGallery = [];
let currentGalleryData = [];
let currentIndex = 0;

const imageModal = document.getElementById('imageModal');
const modalImage = document.getElementById('modalImage');
const modalTitle = document.getElementById('modalTitle');
const modalText = document.getElementById('modalText');
const memeGif = document.getElementById('memeGif');
const closeModal = document.getElementById('closeModal');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const galleryCounter = document.getElementById('galleryCounter');

function updateGalleryCounter() {
    galleryCounter.textContent = `${currentIndex + 1} / ${currentGallery.length}`;
}

function showImage(index) {
    if (currentGallery.length === 0) return;
    
    currentIndex = (index + currentGallery.length) % currentGallery.length;
    modalImage.src = currentGallery[currentIndex];
    
    if (currentGalleryData[currentIndex]) {
        modalTitle.textContent = currentGalleryData[currentIndex].title;
        modalText.textContent = currentGalleryData[currentIndex].text;
    }
    
    updateGalleryCounter();
}

prevBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showImage(currentIndex - 1);
});

nextBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showImage(currentIndex + 1);
});

// =============================================
// ABRIR CAPÍTULO PILOTO (PDF)
// =============================================
document.getElementById('cap-piloto').addEventListener('click', () => {
    window.open('pdfs/Cap_piloto.pdf', '_blank');
});

// =============================================
// ABRIR LEGENDS (PDF)
// =============================================
document.getElementById('legends-primer-capitulo').addEventListener('click', () => {
    window.open('pdfs/Legends.pdf', '_blank');
});

// =============================================
// CLICKS EN IMÁGENES (GALERÍA)
// =============================================
document.querySelectorAll('.image-card').forEach(card => {
    card.addEventListener('click', (e) => {
        const img = card.querySelector('img');
        if (img) {
            const gallery = card.getAttribute('data-gallery');
            
            const galleryCards = document.querySelectorAll(`.image-card[data-gallery="${gallery}"]`);
            currentGallery = [];
            currentGalleryData = [];
            
            galleryCards.forEach(gc => {
                const imgEl = gc.querySelector('img');
                const desc = gc.querySelector('.card-description');
                if (imgEl && desc) {
                    currentGallery.push(imgEl.src);
                    currentGalleryData.push({
                        title: desc.querySelector('.card-title').textContent,
                        text: desc.querySelector('.card-text').textContent
                    });
                }
            });
            
            currentIndex = currentGallery.indexOf(img.src);
            
            modalImage.src = img.src;
            modalTitle.textContent = currentGalleryData[currentIndex].title;
            modalText.textContent = currentGalleryData[currentIndex].text;
            memeGif.src = getRandomMeme();
            updateGalleryCounter();
            imageModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    });
});

closeModal.addEventListener('click', () => {
    imageModal.classList.remove('active');
    document.body.style.overflow = 'auto';
});

imageModal.addEventListener('click', (e) => {
    if (e.target === imageModal) {
        imageModal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
});

// =============================================
// MODAL DE VIDEO
// =============================================
const videoModal = document.getElementById('videoModal');
const modalVideo = document.getElementById('modalVideo');
const videoMemeGif = document.getElementById('videoMemeGif');
const closeVideoModal = document.getElementById('closeVideoModal');

document.querySelectorAll('.video-card').forEach(card => {
    const video = card.querySelector('video');
    const overlay = card.querySelector('.video-overlay');
    
    card.addEventListener('mouseenter', () => video.play().catch(() => {}));
    card.addEventListener('mouseleave', () => {
        video.pause();
        video.currentTime = 0;
    });
    
    overlay.addEventListener('click', (e) => {
        e.stopPropagation();
        modalVideo.src = video.src;
        modalVideo.load();
        videoMemeGif.src = getRandomMeme();
        videoModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    });
});

closeVideoModal.addEventListener('click', () => {
    videoModal.classList.remove('active');
    modalVideo.pause();
    document.body.style.overflow = 'auto';
});

videoModal.addEventListener('click', (e) => {
    if (e.target === videoModal) {
        videoModal.classList.remove('active');
        modalVideo.pause();
        document.body.style.overflow = 'auto';
    }
});

// =============================================
// TECLAS ESC Y FLECHAS
// =============================================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (imageModal.classList.contains('active')) {
            imageModal.classList.remove('active');
            document.body.style.overflow = 'auto';
        }
        if (videoModal.classList.contains('active')) {
            videoModal.classList.remove('active');
            modalVideo.pause();
            document.body.style.overflow = 'auto';
        }
    }
    if (imageModal.classList.contains('active')) {
        if (e.key === 'ArrowLeft') {
            showImage(currentIndex - 1);
        } else if (e.key === 'ArrowRight') {
            showImage(currentIndex + 1);
        }
    }
});

// =============================================
// ANIMACIÓN DE ENTRADA CON INTERSECTION OBSERVER
// =============================================
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.animation = 'fadeInUp 0.8s ease forwards';
        }
    });
}, observerOptions);

document.querySelectorAll('.content-section').forEach(section => {
    observer.observe(section);
});