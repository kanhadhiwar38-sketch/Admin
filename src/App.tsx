import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, set, remove } from 'firebase/database';
import { Search, Film, Tv, Plus, Save, Trash2, Link as LinkIcon, CheckCircle2, AlertCircle, Loader2, PlayCircle, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const firebaseConfig = {
  apiKey: "AIzaSyD5i5XyCnqfx0dfjY33604Q-8nomvtdKzs",
  authDomain: "cinestream-dcb53.firebaseapp.com",
  databaseURL: "https://cinestream-dcb53-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "cinestream-dcb53",
  storageBucket: "cinestream-dcb53.firebasestorage.app"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const TMDB_KEY = "2e211dfda888f7cc55ce433d743f9bc3";

interface TMDBResult {
  id: number;
  name?: string;
  title?: string;
  media_type: 'tv' | 'movie';
  poster_path: string;
}

interface Season {
  season_number: number;
  name: string;
}

interface Episode {
  episode_number: number;
  name: string;
}

interface ServerLink {
  id: string;
  name: string;
  url: string;
  isEmbed: boolean;
}

export default function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'all' | 'movie' | 'tv'>('all');
  const [searchResults, setSearchResults] = useState<TMDBResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const [savedContent, setSavedContent] = useState<TMDBResult[]>([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  
  const [selectedItem, setSelectedItem] = useState<TMDBResult | null>(null);
  
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number | ''>('');
  const [selectedEpisode, setSelectedEpisode] = useState<number | ''>('');
  
  const [servers, setServers] = useState<ServerLink[]>([]);
  
  const [isLoadingSeasons, setIsLoadingSeasons] = useState(false);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
  const [isLoadingServers, setIsLoadingServers] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [status, setStatus] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const loadSavedContent = async () => {
    setIsLoadingSaved(true);
    try {
      const snapshot = await get(ref(db, 'anime'));
      if (snapshot.exists()) {
        const data = snapshot.val();
        const ids = Object.keys(data);
        
        const results: TMDBResult[] = [];
        
        await Promise.all(ids.map(async (idStr) => {
          const id = parseInt(idStr);
          
          // Try TV first
          let res = await fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${TMDB_KEY}`);
          let tmdbData = await res.json();
          
          if (tmdbData.id && tmdbData.success !== false) {
            results.push({
              id: tmdbData.id,
              name: tmdbData.name,
              media_type: 'tv',
              poster_path: tmdbData.poster_path
            });
          } else {
            // Try Movie
            res = await fetch(`https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_KEY}`);
            tmdbData = await res.json();
            if (tmdbData.id) {
              results.push({
                id: tmdbData.id,
                title: tmdbData.title,
                media_type: 'movie',
                poster_path: tmdbData.poster_path
              });
            }
          }
        }));
        
        setSavedContent(results);
      } else {
        setSavedContent([]);
      }
    } catch (error) {
      console.error("Error loading saved content:", error);
    } finally {
      setIsLoadingSaved(false);
    }
  };

  useEffect(() => {
    loadSavedContent();
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const searchTMDB = async (overrideType?: 'all' | 'movie' | 'tv') => {
    if (!searchQuery.trim()) return;
    const typeToSearch = overrideType || searchType;
    setIsSearching(true);
    try {
      let endpoint = '/search/multi';
      if (typeToSearch === 'movie') endpoint = '/search/movie';
      if (typeToSearch === 'tv') endpoint = '/search/tv';

      const res = await fetch(`https://api.themoviedb.org/3${endpoint}?api_key=${TMDB_KEY}&query=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      
      const animeResults = data.results.map((item: any) => ({
        ...item,
        media_type: item.media_type || (typeToSearch !== 'all' ? typeToSearch : undefined)
      })).filter((item: any) => 
        (item.media_type === 'tv' || item.media_type === 'movie') && item.poster_path
      );
      
      setSearchResults(animeResults);
    } catch (error) {
      console.error("Error searching TMDB:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleTypeChange = (type: 'all' | 'movie' | 'tv') => {
    setSearchType(type);
    if (searchQuery.trim()) {
      searchTMDB(type);
    }
  };

  const handleSelectAnime = async (item: TMDBResult) => {
    setSelectedItem(item);
    setServers([]);
    setStatus(null);
    
    if (item.media_type === 'movie') {
      setSelectedSeason(1);
      setSelectedEpisode(1);
      fetchServers(item.id, 1, 1);
    } else {
      setSelectedSeason('');
      setSelectedEpisode('');
      setEpisodes([]);
      setIsLoadingSeasons(true);
      try {
        const res = await fetch(`https://api.themoviedb.org/3/tv/${item.id}?api_key=${TMDB_KEY}`);
        const data = await res.json();
        if (data.seasons) {
          const validSeasons = data.seasons.filter((s: any) => s.season_number > 0);
          setSeasons(validSeasons);
          if (validSeasons.length > 0) {
            handleSeasonChange(validSeasons[0].season_number, item.id);
          }
        }
      } catch (error) {
        console.error("Error fetching seasons:", error);
      } finally {
        setIsLoadingSeasons(false);
      }
    }
  };

  const handleSeasonChange = async (seasonNum: number, animeId: number = selectedItem?.id || 0) => {
    setSelectedSeason(seasonNum);
    setSelectedEpisode('');
    setServers([]);
    setIsLoadingEpisodes(true);
    try {
      const res = await fetch(`https://api.themoviedb.org/3/tv/${animeId}/season/${seasonNum}?api_key=${TMDB_KEY}`);
      const data = await res.json();
      if (data.episodes) {
        setEpisodes(data.episodes);
        if (data.episodes.length > 0) {
          handleEpisodeChange(data.episodes[0].episode_number, animeId, seasonNum);
        }
      }
    } catch (error) {
      console.error("Error fetching episodes:", error);
    } finally {
      setIsLoadingEpisodes(false);
    }
  };

  const handleEpisodeChange = (epNum: number, animeId: number = selectedItem?.id || 0, seasonNum: number = selectedSeason as number) => {
    setSelectedEpisode(epNum);
    fetchServers(animeId, seasonNum, epNum);
  };

  const fetchServers = async (animeId: number, season: number, ep: number) => {
    setIsLoadingServers(true);
    try {
      const snapshot = await get(ref(db, `anime/${animeId}/${season}/${ep}`));
      const data = snapshot.val();
      
      if (!data) {
        setServers([{ id: Date.now().toString(), name: '', url: '', isEmbed: false }]);
      } else {
        const loadedServers: ServerLink[] = [];
        for (let key in data) {
          let sData = data[key];
          let url = typeof sData === 'string' ? sData : sData.url;
          let isEmbed = typeof sData === 'object' ? (sData.isEmbed || false) : false;
          loadedServers.push({ id: Math.random().toString(36).substr(2, 9), name: key, url, isEmbed });
        }
        setServers(loadedServers.length > 0 ? loadedServers : [{ id: Date.now().toString(), name: '', url: '', isEmbed: false }]);
      }
    } catch (error) {
      console.error("Error fetching servers:", error);
      setStatus({ message: "Failed to load existing links.", type: 'error' });
    } finally {
      setIsLoadingServers(false);
    }
  };

  const addServerRow = () => {
    setServers([...servers, { id: Date.now().toString(), name: '', url: '', isEmbed: false }]);
  };

  const removeServerRow = (id: string) => {
    setServers(servers.filter(s => s.id !== id));
  };

  const updateServer = (id: string, field: keyof ServerLink, value: any) => {
    setServers(servers.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const saveAllServers = async () => {
    if (!selectedItem || selectedSeason === '' || selectedEpisode === '') return;
    
    setIsSaving(true);
    setStatus({ message: "Saving changes...", type: 'info' });
    
    let updateData: Record<string, any> = {};
    let count = 0;

    servers.forEach(s => {
      const name = s.name.trim();
      const url = s.url.trim();
      if (name && url) {
        updateData[name] = { url, isEmbed: s.isEmbed };
        count++;
      }
    });

    try {
      if (count === 0) {
        await remove(ref(db, `anime/${selectedItem.id}/${selectedSeason}/${selectedEpisode}`));
        setStatus({ message: "All links cleared!", type: 'success' });
        setServers([{ id: Date.now().toString(), name: '', url: '', isEmbed: false }]);
      } else {
        await set(ref(db, `anime/${selectedItem.id}/${selectedSeason}/${selectedEpisode}`), updateData);
        setStatus({ message: `${count} link(s) updated successfully!`, type: 'success' });
      }
    } catch (error: any) {
      setStatus({ message: `Failed to save: ${error.message}`, type: 'error' });
    } finally {
      setIsSaving(false);
      setTimeout(() => setStatus(null), 3000);
      loadSavedContent();
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-violet-500/30">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-zinc-950/80 backdrop-blur-md border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <PlayCircle className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-fuchsia-400">
            Anime OTT Admin
          </h1>
        </div>
        <div className="flex items-center gap-4 text-zinc-400">
          <Settings className="w-5 h-5 hover:text-white cursor-pointer transition-colors" />
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-8">
        {/* Search Section */}
        <div className="relative group">
          <div className="absolute inset-0 bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 rounded-2xl blur-xl transition-all duration-500 group-hover:blur-2xl opacity-50"></div>
          <div className="relative flex flex-col gap-3 bg-zinc-900/50 p-3 rounded-2xl border border-white/10 backdrop-blur-sm shadow-xl">
            <div className="flex gap-3">
              <div className="relative flex-1 flex items-center">
                <Search className="absolute left-4 w-5 h-5 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search for Anime Series or Movies..."
                  className="w-full bg-transparent border-none py-2 pl-12 pr-4 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-0 text-lg"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchTMDB()}
                />
              </div>
              <button
                onClick={() => searchTMDB()}
                disabled={isSearching}
                className="px-8 py-2 bg-white text-zinc-950 font-semibold rounded-xl hover:bg-zinc-200 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Search'}
              </button>
            </div>
            
            {/* Filter Toggles */}
            <div className="flex items-center gap-2 px-2 pb-1">
              <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider mr-2">Filter:</span>
              <button 
                onClick={() => handleTypeChange('all')}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${searchType === 'all' ? 'bg-white/10 text-white border border-white/20' : 'bg-transparent text-zinc-500 border border-transparent hover:text-zinc-300'}`}
              >
                All
              </button>
              <button 
                onClick={() => handleTypeChange('movie')}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${searchType === 'movie' ? 'bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30' : 'bg-transparent text-zinc-500 border border-transparent hover:text-zinc-300'}`}
              >
                <Film className="w-3.5 h-3.5" /> Movies
              </button>
              <button 
                onClick={() => handleTypeChange('tv')}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${searchType === 'tv' ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30' : 'bg-transparent text-zinc-500 border border-transparent hover:text-zinc-300'}`}
              >
                <Tv className="w-3.5 h-3.5" /> Series
              </button>
            </div>
          </div>
        </div>

        {/* Results Grid (Search or Saved) */}
        {(searchResults.length > 0 || (!searchQuery && savedContent.length > 0)) && (
          <div className="space-y-4">
            {!searchQuery && (
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Film className="w-5 h-5 text-violet-400" />
                Saved in Database
                {isLoadingSaved && <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />}
              </h2>
            )}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
            >
              {(searchQuery ? searchResults : savedContent).map((item) => (
                <motion.div
                  key={item.id}
                  whileHover={{ y: -5, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleSelectAnime(item)}
                  className={`relative group cursor-pointer rounded-2xl overflow-hidden bg-zinc-900 border-2 transition-colors ${selectedItem?.id === item.id ? 'border-violet-500 shadow-lg shadow-violet-500/20' : 'border-transparent hover:border-white/10'}`}
                >
                  <div className="absolute top-2 right-2 z-10">
                    <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md bg-zinc-950/80 backdrop-blur-md text-zinc-300 border border-white/10 flex items-center gap-1.5">
                      {item.media_type === 'movie' ? <Film className="w-3 h-3 text-fuchsia-400" /> : <Tv className="w-3 h-3 text-violet-400" />}
                      {item.media_type === 'movie' ? 'Movie' : 'Series'}
                    </span>
                  </div>
                  <div className="aspect-[2/3] relative">
                    <img
                      src={`https://image.tmdb.org/t/p/w342${item.poster_path}`}
                      alt={item.title || item.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent opacity-80"></div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <p className="font-medium text-sm line-clamp-2 text-zinc-100 leading-tight">
                      {item.title || item.name}
                    </p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        )}

        {!searchQuery && savedContent.length === 0 && !isLoadingSaved && (
          <div className="text-center py-16 bg-zinc-900/30 rounded-3xl border border-white/5">
            <Film className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-zinc-300">No content saved yet</h3>
            <p className="text-zinc-500 mt-1">Search for an anime or movie to add it to your database.</p>
          </div>
        )}

        {/* Editor Section */}
        <AnimatePresence>
          {selectedItem && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-zinc-900/40 border border-white/5 rounded-3xl p-6 md:p-8 backdrop-blur-xl shadow-2xl"
            >
              <div className="flex flex-col md:flex-row gap-8">
                
                {/* Left: Poster & Info */}
                <div className="w-full md:w-1/4 shrink-0 space-y-4">
                  <div className="aspect-[2/3] rounded-2xl overflow-hidden border border-white/10 shadow-xl">
                    <img
                      src={`https://image.tmdb.org/t/p/w500${selectedItem.poster_path}`}
                      alt={selectedItem.title || selectedItem.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white leading-tight">
                      {selectedItem.title || selectedItem.name}
                    </h2>
                    <p className="text-zinc-500 text-sm mt-1 flex items-center gap-2">
                      {selectedItem.media_type === 'movie' ? <Film className="w-4 h-4" /> : <Tv className="w-4 h-4" />}
                      {selectedItem.media_type === 'movie' ? 'Movie' : 'TV Series'}
                    </p>
                  </div>
                </div>

                {/* Right: Controls */}
                <div className="flex-1 space-y-8">
                  
                  {/* Season & Episode Selectors */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5 bg-zinc-950/50 rounded-2xl border border-white/5">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                        Season
                        {isLoadingSeasons && <Loader2 className="w-3 h-3 animate-spin text-violet-500" />}
                      </label>
                      <select
                        value={selectedSeason}
                        onChange={(e) => handleSeasonChange(Number(e.target.value))}
                        disabled={selectedItem.media_type === 'movie' || isLoadingSeasons}
                        className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none disabled:opacity-50 appearance-none cursor-pointer"
                      >
                        {selectedItem.media_type === 'movie' ? (
                          <option value={1}>Movie</option>
                        ) : (
                          seasons.map(s => (
                            <option key={s.season_number} value={s.season_number}>
                              Season {s.season_number}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                        Episode
                        {isLoadingEpisodes && <Loader2 className="w-3 h-3 animate-spin text-violet-500" />}
                      </label>
                      <select
                        value={selectedEpisode}
                        onChange={(e) => handleEpisodeChange(Number(e.target.value))}
                        disabled={selectedItem.media_type === 'movie' || isLoadingEpisodes || selectedSeason === ''}
                        className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none disabled:opacity-50 appearance-none cursor-pointer"
                      >
                        {selectedItem.media_type === 'movie' ? (
                          <option value={1}>Full Movie</option>
                        ) : (
                          episodes.map(ep => (
                            <option key={ep.episode_number} value={ep.episode_number}>
                              Ep {ep.episode_number} - {ep.name.length > 25 ? ep.name.substring(0, 25) + '...' : ep.name}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                  </div>

                  {/* Server Links Manager */}
                  {selectedSeason !== '' && selectedEpisode !== '' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                            <LinkIcon className="w-5 h-5 text-violet-400" />
                            Manage Video Links
                          </h3>
                          <p className="text-xs text-zinc-500 mt-1">
                            Check "Embed" if the link is a website player (e.g. YouTube). Uncheck for direct files (.mp4).
                          </p>
                        </div>
                        {isLoadingServers && <Loader2 className="w-5 h-5 animate-spin text-violet-500" />}
                      </div>

                      <div className="space-y-3">
                        <AnimatePresence>
                          {servers.map((server, index) => (
                            <motion.div
                              key={server.id}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              className="flex flex-col sm:flex-row gap-3 p-3 bg-zinc-950/40 rounded-xl border border-white/5 items-start sm:items-center group"
                            >
                              <div className="flex-1 w-full sm:w-auto">
                                <input
                                  type="text"
                                  placeholder="Server Name (e.g. Hindi HD)"
                                  value={server.name}
                                  onChange={(e) => updateServer(server.id, 'name', e.target.value)}
                                  className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:ring-1 focus:ring-violet-500 outline-none"
                                />
                              </div>
                              <div className="flex-[2] w-full sm:w-auto">
                                <input
                                  type="url"
                                  placeholder="https://..."
                                  value={server.url}
                                  onChange={(e) => updateServer(server.id, 'url', e.target.value)}
                                  className="w-full bg-zinc-900 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:ring-1 focus:ring-violet-500 outline-none font-mono"
                                />
                              </div>
                              <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                                <label className="flex items-center gap-2 cursor-pointer bg-zinc-900 px-3 py-2.5 rounded-lg border border-white/10 hover:border-white/20 transition-colors">
                                  <input
                                    type="checkbox"
                                    checked={server.isEmbed}
                                    onChange={(e) => updateServer(server.id, 'isEmbed', e.target.checked)}
                                    className="w-4 h-4 rounded border-zinc-700 text-violet-500 focus:ring-violet-500 focus:ring-offset-zinc-900 bg-zinc-800"
                                  />
                                  <span className="text-xs font-medium text-zinc-300">Embed</span>
                                </label>
                                <button
                                  onClick={() => removeServerRow(server.id)}
                                  className="p-2.5 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                  title="Remove link"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-white/5">
                        <button
                          onClick={addServerRow}
                          className="flex-1 py-3 border border-dashed border-white/20 text-zinc-400 hover:text-white hover:border-white/40 hover:bg-white/5 rounded-xl font-medium flex items-center justify-center gap-2 transition-all text-sm"
                        >
                          <Plus className="w-4 h-4" /> Add Another Link
                        </button>
                        <button
                          onClick={saveAllServers}
                          disabled={isSaving || isLoadingServers}
                          className="flex-[2] py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 shadow-lg shadow-violet-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          Save Changes
                        </button>
                      </div>

                      {/* Status Message */}
                      <AnimatePresence>
                        {status && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className={`flex items-center gap-2 p-4 rounded-xl text-sm font-medium ${
                              status.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                              status.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                              'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            }`}
                          >
                            {status.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> :
                             status.type === 'error' ? <AlertCircle className="w-4 h-4" /> :
                             <Loader2 className="w-4 h-4 animate-spin" />}
                            {status.message}
                          </motion.div>
                        )}
                      </AnimatePresence>

                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>
    </div>
  );
}
