import React, { useState } from 'react';
import { Image, Send, X } from './icons';
import { GlassCard } from './GlassCard';
import { useTranslations } from '../hooks/useTranslations';
import type { Post } from '../types';

interface SocialPostBoxProps {
    businessId: string;
    businessName: string;
    businessAvatar: string;
    onSubmit?: (post: Partial<Post>) => void;
}

export const SocialPostBox: React.FC<SocialPostBoxProps> = ({ businessId, businessName, businessAvatar, onSubmit }) => {
    const [caption, setCaption] = useState('');
    const [image, setImage] = useState<string | null>(null);
    const [isPosting, setIsPosting] = useState(false);
    const { t } = useTranslations();

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setImage(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!caption || !image) return;

        setIsPosting(true);
        try {
            if (onSubmit) {
                await onSubmit({
                    caption,
                    imageUrl: image,
                    createdAt: new Date(),
                    likes: 0
                });
            }
            setCaption('');
            setImage(null);
        } catch (error) {
            console.error('Error creating post:', error);
        } finally {
            setIsPosting(false);
        }
    };

    return (
        <GlassCard className="p-6 mb-8">
            <div className="flex items-center gap-4 mb-4">
                <img src={businessAvatar} alt={businessName} className="w-10 h-10 rounded-full border border-primary/30" />
                <h3 className="font-semibold text-white">{businessName}</h3>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
                <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder={t('social.postPlaceholder')}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white outline-none focus:border-primary transition-colors resize-none min-h-[100px]"
                />
                
                {image && (
                    <div className="relative rounded-xl overflow-hidden border border-white/10">
                        <img src={image} alt="Preview" className="w-full h-48 object-cover" />
                        <button 
                            type="button"
                            onClick={() => setImage(null)}
                            className="absolute top-2 right-2 p-1 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}
                
                <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 cursor-pointer transition-colors">
                        <Image className="w-5 h-5 text-primary" />
                        <span className="text-sm">{t('social.addPhoto')}</span>
                        <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                    </label>
                    
                    <button 
                        type="submit"
                        disabled={!caption || !image || isPosting}
                        className="flex items-center gap-2 px-6 py-2 rounded-lg bg-gradient-to-r from-primary to-secondary text-white font-semibold hover:shadow-glow-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isPosting ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <Send className="w-4 h-4" />
                                <span>{t('social.post')}</span>
                            </>
                        )}
                    </button>
                </div>
            </form>
        </GlassCard>
    );
};
