import React, { useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Sparkles, CheckCircle, X, ShieldCheck, Briefcase, MapPin, Navigation } from './icons';
import { GlassCard } from './GlassCard';
import { api } from '../services/api';
import type { BusinessPostcard } from '../types';

const GOVERNORATES = [
  'Baghdad', 'Basra', 'Nineveh', 'Erbil', 'Sulaymaniyah', 'Duhok',
  'Kirkuk', 'Anbar', 'Babil', 'Diyala', 'Dhi Qar', 'Wasit',
  'Muthanna', 'Qadisiyyah', 'Maysan', 'Najaf', 'Karbala', 'Saladin'
];

const ALLOWED_CATEGORIES = ['Cafe', 'Restaurant', 'Bakery', 'Hotel', 'Gym', 'Salon', 'Pharmacy', 'Supermarket'];

interface PipelineReport {
  total_found: number;
  total_verified: number;
  total_rejected: number;
  flagged_businesses: { name: string; city: string; reason: string }[];
}

export const DataArchitect: React.FC = () => {
  const [selectedGovernorate, setSelectedGovernorate] = useState(GOVERNORATES[0]);
  const [rawJson, setRawJson] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [report, setReport] = useState<PipelineReport | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [existingPostcards, setExistingPostcards] = useState<BusinessPostcard[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isGeneratingTagline, setIsGeneratingTagline] = useState<string | null>(null);

  const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const fetchExisting = async () => {
    setIsFetching(true);
    try {
      const data = await api.getPostcards(selectedGovernorate);
      setExistingPostcards(data);
    } catch (err) {
      console.error("Fetch failed", err);
    } finally {
      setIsFetching(false);
    }
  };

  const generateTagline = async (postcard: BusinessPostcard) => {
    if (!postcard.top_reviews || postcard.top_reviews.length === 0) {
      alert("No reviews available for this business to generate a tagline.");
      return;
    }

    setIsGeneratingTagline(postcard.id || postcard.title);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
      const topReviews = postcard.top_reviews.join('\n');
      
      const aiResponse = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `You are a creative copywriter for a local business discovery app in Iraq.
        Based on these Google Maps reviews for "${postcard.title}":
        ${topReviews}
        Write a single punchy tagline (max 15 words) that captures the vibe of this business.
        Tone: warm, local, and confident. No emojis. No generic phrases like "best in town."`
      });

      const newTagline = aiResponse.text.trim().replace(/^"|"$/g, '');
      
      const updatedPostcard = { ...postcard, postcard_content: newTagline };
      const result = await api.upsertPostcard(updatedPostcard);
      
      if (result.success) {
        setExistingPostcards(prev => prev.map(p => (p.id === postcard.id ? updatedPostcard : p)));
      }
    } catch (err) {
      console.error("Tagline generation failed", err);
    } finally {
      setIsGeneratingTagline(null);
    }
  };

  const processPipeline = async () => {
    if (!rawJson.trim()) return;
    setIsProcessing(true);
    setReport(null);
    setLogs([]);
    addLog(`Starting pipeline for ${selectedGovernorate}...`);

    try {
      const data = JSON.parse(rawJson);
      const places = Array.isArray(data) ? data : (data.places || []);
      
      let verifiedCount = 0;
      let rejectedCount = 0;
      const flagged: { name: string; city: string; reason: string }[] = [];
      const postcards: BusinessPostcard[] = [];

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

      for (const place of places) {
        const name = place.title || place.name;
        const phone = place.phone || place.phoneNumber;
        const category = place.categoryName || place.category;
        const images = place.images || place.imageUrls || [];
        const reviews = place.reviews || [];
        
        addLog(`Verifying: ${name}...`);

        // STEP 2: VERIFICATION FILTER
        if (!phone || !phone.startsWith('+964')) {
          flagged.push({ name, city: selectedGovernorate, reason: 'No +964 phone number' });
          rejectedCount++;
          continue;
        }

        const matchedCategory = ALLOWED_CATEGORIES.find(c => category?.toLowerCase().includes(c.toLowerCase()));
        if (!matchedCategory) {
          flagged.push({ name, city: selectedGovernorate, reason: `Category mismatch: ${category}` });
          rejectedCount++;
          continue;
        }

        if (images.length < 3) {
          flagged.push({ name, city: selectedGovernorate, reason: `Insufficient images (${images.length})` });
          rejectedCount++;
          continue;
        }

        // STEP 3: NORMALIZATION
        const neighborhood = place.neighborhood || place.sublocality || 'City Center';
        const city = selectedGovernorate; // Governorate capital logic simplified for this demo

        // STEP 4: POSTCARD GENERATION
        addLog(`Generating AI tagline for ${name}...`);
        const topReviews = reviews.slice(0, 3).map((r: any) => r.text).join('\n');
        
        let tagline = `${name} in ${city}`;
        try {
            const aiResponse = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: `You are a creative copywriter for a local business discovery app in Iraq.
                Based on these Google Maps reviews for "${name}":
                ${topReviews}
                Write a single punchy tagline (max 15 words) that captures the vibe of this business.
                Tone: warm, local, and confident. No emojis. No generic phrases like "best in town."`
            });
            tagline = aiResponse.text.trim().replace(/^"|"$/g, '');
        } catch (err) {
            console.error("AI Generation failed", err);
        }

        const postcard: BusinessPostcard = {
          title: name,
          city,
          neighborhood,
          governorate: selectedGovernorate,
          category_tag: matchedCategory as any,
          phone,
          website: place.website,
          instagram: place.instagram,
          hero_image: images[0],
          image_gallery: images.slice(0, 5),
          postcard_content: tagline,
          top_reviews: reviews.slice(0, 3).map((r: any) => r.text),
          google_maps_url: place.url || place.googleMapsUrl,
          rating: place.totalScore || place.rating || 0,
          review_count: place.reviewsCount || place.reviewCount || 0,
          verified: true
        };

        // STEP 6: UPSERT
        const result = await api.upsertPostcard(postcard);
        if (result.success) {
          postcards.push(postcard);
          verifiedCount++;
          addLog(`✅ Successfully upserted: ${name}`);
        } else {
          addLog(`❌ Failed to upsert: ${name}`);
        }
      }

      setReport({
        total_found: places.length,
        total_verified: verifiedCount,
        total_rejected: rejectedCount,
        flagged_businesses: flagged
      });
      addLog(`Pipeline complete for ${selectedGovernorate}.`);

    } catch (err) {
      console.error("Pipeline failed", err);
      addLog(`Critical Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            AI Data Architect
          </h2>
          <p className="text-white/60 text-sm">Collect, verify, and format business data across Iraq.</p>
        </div>
        <div className="flex items-center gap-3">
          <select 
            value={selectedGovernorate}
            onChange={(e) => setSelectedGovernorate(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:border-primary transition-all"
          >
            {GOVERNORATES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <button 
            onClick={processPipeline}
            disabled={isProcessing || !rawJson.trim()}
            className="px-6 py-2 rounded-xl bg-gradient-to-r from-primary to-secondary text-white font-semibold hover:shadow-glow-primary transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {isProcessing ? <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Run Pipeline
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-secondary" />
              Raw Apify Input (JSON)
            </h3>
            <button 
              onClick={() => setRawJson('')}
              className="text-white/40 hover:text-white text-xs transition-all"
            >
              Clear
            </button>
          </div>
          <textarea 
            value={rawJson}
            onChange={(e) => setRawJson(e.target.value)}
            placeholder='Paste your Google Maps Scraper results here (JSON array)...'
            className="w-full h-[400px] bg-white/5 border border-white/10 rounded-2xl p-4 text-white font-mono text-xs outline-none focus:border-primary transition-all resize-none"
          />
        </div>

        <div className="space-y-4">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <Navigation className="w-5 h-5 text-primary" />
            Pipeline Logs
          </h3>
          <div className="w-full h-[400px] bg-black/40 border border-white/10 rounded-2xl p-4 overflow-y-auto font-mono text-[10px] space-y-1">
            {logs.length === 0 ? (
              <p className="text-white/20 italic">Waiting for pipeline to start...</p>
            ) : (
              logs.map((log, i) => (
                <p key={i} className={log.includes('✅') ? 'text-green-400' : log.includes('❌') ? 'text-red-400' : 'text-white/60'}>
                  {log}
                </p>
              ))
            )}
          </div>
        </div>
      </div>

      {report && (
        <GlassCard className="p-8 border-primary/20">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <CheckCircle className="w-6 h-6 text-green-400" />
              Pipeline Report: {selectedGovernorate}
            </h3>
            <div className="flex gap-4">
              <div className="text-center">
                <p className="text-white/40 text-[10px] uppercase tracking-wider">Found</p>
                <p className="text-xl font-bold text-white">{report.total_found}</p>
              </div>
              <div className="text-center">
                <p className="text-white/40 text-[10px] uppercase tracking-wider">Verified</p>
                <p className="text-xl font-bold text-green-400">{report.total_verified}</p>
              </div>
              <div className="text-center">
                <p className="text-white/40 text-[10px] uppercase tracking-wider">Rejected</p>
                <p className="text-xl font-bold text-red-400">{report.total_rejected}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-white font-semibold text-sm">Flagged Businesses</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {report.flagged_businesses.map((f, i) => (
                <div key={i} className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
                    <X className="w-4 h-4 text-red-400" />
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">{f.name}</p>
                    <p className="text-white/40 text-xs">{f.reason}</p>
                  </div>
                </div>
              ))}
              {report.flagged_businesses.length === 0 && (
                <p className="text-white/40 text-sm italic">No businesses were flagged.</p>
              )}
            </div>
          </div>
        </GlassCard>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-secondary" />
            AI Tagline Refiner
          </h3>
          <button 
            onClick={fetchExisting}
            disabled={isFetching}
            className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm hover:bg-white/10 transition-all flex items-center gap-2"
          >
            {isFetching ? <div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" /> : <Navigation className="w-3 h-3" />}
            Fetch {selectedGovernorate} Businesses
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {existingPostcards.map((p) => (
            <GlassCard key={p.id} className="p-4 flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-white font-bold">{p.title}</h4>
                  <p className="text-white/40 text-xs">{p.neighborhood}, {p.city}</p>
                </div>
                <div className="px-2 py-1 rounded-lg bg-primary/20 text-primary text-[10px] font-bold uppercase">
                  {p.category_tag}
                </div>
              </div>

              <div className="flex-grow">
                <p className="text-white/80 text-sm italic leading-relaxed">
                  "{p.postcard_content || 'No tagline generated yet.'}"
                </p>
              </div>

              <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <span className="text-yellow-400 text-xs">★</span>
                  <span className="text-white text-xs font-bold">{p.rating}</span>
                  <span className="text-white/40 text-[10px]">({p.review_count})</span>
                </div>
                <button 
                  onClick={() => generateTagline(p)}
                  disabled={isGeneratingTagline === (p.id || p.title)}
                  className="px-3 py-1.5 rounded-lg bg-secondary/20 text-secondary text-xs font-semibold hover:bg-secondary/30 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {isGeneratingTagline === (p.id || p.title) ? (
                    <div className="w-3 h-3 border-2 border-secondary/50 border-t-secondary rounded-full animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  Generate Tagline
                </button>
              </div>
            </GlassCard>
          ))}
          {existingPostcards.length === 0 && !isFetching && (
            <div className="col-span-full py-12 text-center bg-white/5 border border-dashed border-white/10 rounded-3xl">
              <p className="text-white/20 italic">No businesses fetched yet. Select a governorate and click fetch.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
