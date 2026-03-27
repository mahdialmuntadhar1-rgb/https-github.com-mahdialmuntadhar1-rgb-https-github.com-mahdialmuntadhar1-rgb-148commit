import React from 'react';
import { heroSlides } from '../constants';
import { useTranslations } from '../hooks/useTranslations';

export const HeroSection: React.FC = () => {
    const [activeSlide, setActiveSlide] = React.useState(0);
    const scrollRef = React.useRef<HTMLDivElement>(null);
    const autoScrollInterval = React.useRef<number | null>(null);
    const { t } = useTranslations();

    const handleScroll = () => {
        if (scrollRef.current) {
            const scrollLeft = scrollRef.current.scrollLeft;
            const slideWidth = scrollRef.current.clientWidth;
            const newActiveSlide = Math.round(scrollLeft / slideWidth);
            if(newActiveSlide !== activeSlide) {
                setActiveSlide(newActiveSlide);
            }
        }
    };
    
    const scrollToSlide = (index: number) => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({
                left: index * scrollRef.current.clientWidth,
                behavior: 'smooth'
            });
            setActiveSlide(index);
        }
    };
    
    const startAutoScroll = React.useCallback(() => {
        stopAutoScroll();
        autoScrollInterval.current = window.setInterval(() => {
            setActiveSlide(prev => {
                const nextSlide = (prev + 1) % heroSlides.length;
                if (scrollRef.current) {
                    scrollRef.current.scrollTo({
                        left: nextSlide * scrollRef.current.clientWidth,
                        behavior: 'smooth'
                    });
                }
                return nextSlide;
            });
        }, 5000);
    }, []);

    const stopAutoScroll = () => {
        if (autoScrollInterval.current) {
            clearInterval(autoScrollInterval.current);
        }
    };

    React.useEffect(() => {
        startAutoScroll();
        return stopAutoScroll;
    }, [startAutoScroll]);


    return (
        <section className="relative h-[60vh] md:h-screen w-full overflow-hidden flex flex-col justify-center items-center">
             <div 
                className="absolute inset-0 flex w-full h-full overflow-x-auto snap-x snap-mandatory scrollbar-hide"
                ref={scrollRef}
                onScroll={handleScroll}
                onMouseDown={stopAutoScroll}
                onTouchStart={stopAutoScroll}
                onMouseUp={startAutoScroll}
                onTouchEnd={startAutoScroll}
            >
                {heroSlides.map(slide => (
                    <div key={slide.id} className="relative w-full h-full flex-shrink-0 snap-start flex items-center justify-center text-center">
                        <img src={slide.image} alt={t(slide.titleKey)} className="absolute inset-0 w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-dark-bg/60"></div>
                        <div className="relative z-10 px-4">
                             <h1 className="text-4xl lg:text-6xl font-bold mb-4 text-white">
                                <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary via-secondary to-accent">
                                    {t(slide.titleKey)}
                                </span>
                            </h1>
                            <p className="text-lg text-white/70 mb-8 max-w-2xl mx-auto">{t(slide.subtitleKey)}</p>
                        </div>
                    </div>
                ))}
            </div>
            
             <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex gap-2">
                {heroSlides.map((_, index) => (
                    <button key={index} onClick={() => scrollToSlide(index)} className={`w-2 h-2 rounded-full transition-all duration-300 ${activeSlide === index ? 'w-8 bg-primary' : 'bg-white/20 hover:bg-white/40'}`} aria-label={`Go to slide ${index + 1}`}/>
                ))}
            </div>
        </section>
    );
};