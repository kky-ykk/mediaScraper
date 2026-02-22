import { useState } from 'react';
import axios from 'axios';
import './App.css';
// Note: App.css imports might overlap with index.css, considering we moved logic to index.css, 
// valid to keep it if it has specific component styles, but we are using index.css mainly now.
import { useTheme } from './ThemeContext';

interface MediaData {
  images: string[];
  videos: string[];
  audios: string[];
}

function App() {
  const [url, setUrl] = useState('');
  const [media, setMedia] = useState<MediaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'images' | 'videos' | 'audios'>('images');
  const { theme, toggleTheme } = useTheme();

  const handleFetch = async () => {
    if (!url) {
      setError('Please enter a URL');
      return;
    }
    setError('');
    setLoading(true);
    setMedia(null);

    try {
      const response = await axios.post('http://localhost:3000/scrape', { url });
      setMedia(response.data);
      if (response.data.images.length > 0) setActiveTab('images');
      else if (response.data.videos.length > 0) setActiveTab('videos');
      else if (response.data.audios.length > 0) setActiveTab('audios');
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to fetch media. Make sure the backend is running and URL is valid.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen text-primary font-sans p-8 transition-colors duration-300">

      {/* Theme Toggle */}
      {/* Theme Toggle */}
      <button onClick={toggleTheme} className="theme-toggle hover:text-accent" aria-label="Toggle Theme">
        {theme === 'light' ? (
          <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>
        ) : (
          <svg className="w-6 h-6 text-yellow-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
        )}
      </button>

      <div className="max-w-6xl mx-auto pt-12">
        <header className="text-center mb-12 animate-fade-in">
          <h1 className="text-5xl font-extrabold mb-4 text-primary opacity-90 drop-shadow-md">
            MediaScraper
          </h1>
          <p className="text-xl text-secondary">Extract images, videos, and audio from any website instantly.</p>
        </header>

        <div className="glass-panel p-8 rounded-2xl shadow-2xl mb-12 max-w-3xl mx-auto">
          <div className="flex flex-col md:flex-row gap-4">
            <input
              type="text"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1 input-theme"
              onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
            />
            <button
              onClick={handleFetch}
              disabled={loading}
              className="btn-primary"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Fetching...
                </span>
              ) : (
                'Fetch Media'
              )}
            </button>
          </div>
          {error && <div className="error-box">{error}</div>}
        </div>

        {media && (
          <div className="glass-panel p-8 rounded-2xl shadow-2xl animate-fade-in">
            <div className="flex justify-center gap-4 mb-8 pb-4 border-b border-white/10">
              {(['images', 'videos', 'audios'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setActiveTab(type)}
                  className={`tab-btn ${activeTab === type ? 'tab-btn-active' : 'tab-btn-inactive'}`}
                >
                  {type} ({media[type].length})
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {media[activeTab].length === 0 ? (
                <div className="col-span-full text-center py-12 text-secondary">
                  No {activeTab} found on this page.
                </div>
              ) : (
                media[activeTab].map((src, index) => (
                  <div key={index} className="media-card group">
                    {activeTab === 'images' && (
                      <div className="aspect-video overflow-hidden relative">
                        <a href={src} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
                          <img src={src} alt={`scraped-${index}`} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" />
                          <div className="absolute inset-0 bg-gradient-overlay opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
                            <span className="text-xs text-white hover:underline truncate w-full block">Click to Open Original</span>
                          </div>
                        </a>
                      </div>
                    )}
                    {activeTab === 'videos' && (
                      <div className="aspect-video bg-black/90 overflow-hidden relative group">
                        <video controls className="w-full h-full" src={src}></video>
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <a
                            href={src}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-black/50 hover:bg-black/80 text-white p-2 rounded-full backdrop-blur-sm transition-colors border border-white/20 flex items-center gap-1 text-xs px-3"
                            title="Open Video in New Tab"
                          >
                            <span>Open</span>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                          </a>
                        </div>
                        <div className="p-3 text-xs text-secondary break-all truncate absolute bottom-0 w-full bg-black/60">{src}</div>
                      </div>
                    )}
                    {activeTab === 'audios' && (
                      <div className="p-6 flex flex-col items-center justify-center h-full">
                        <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center mb-4 text-accent">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path></svg>
                        </div>
                        <audio controls className="w-full" src={src}></audio>
                        <div className="mt-2 text-xs text-secondary w-full text-center truncate">{src}</div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
