import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, set, remove } from 'firebase/database';
import { Search, Film, Tv, Plus, Save, Trash2, Loader2 } from 'lucide-react';

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
    <div className="min-h-screen bg-[#0b0b0b] text-white font-sans">
      {/* Header */}
      <header className="bg-[#111] p-5 text-center border-b-2 border-[#333]">
        <h1 className="m-0 text-2xl font-bold text-[#00a859] cursor-pointer inline-block" onClick={() => {setSelectedItem(null); setSearchQuery(''); setSearchResults([]);}}>
          MOVIE+
        </h1>
      </header>

      <main className="max-w-[900px] mx-auto my-5 px-[15px] space-y-6">
        {/* Search Section */}
        {!selectedItem && (
          <div>
            <div className="flex gap-[10px] mb-5">
              <input
                type="text"
                placeholder="Search by Name or TMDB ID..."
                className="flex-1 p-3 rounded-md border border-[#333] bg-[#222] text-white focus:outline-none focus:border-[#00a859]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchTMDB()}
              />
              <button
                onClick={() => searchTMDB()}
                disabled={isSearching}
                className="px-5 py-3 bg-[#00a859] text-white rounded-md font-bold hover:bg-[#008f4c] transition-colors disabled:opacity-50 flex items-center justify-center min-w-[100px]"
              >
                {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : 'SEARCH'}
              </button>
            </div>
            
            {/* Filter Toggles */}
            <div className="flex items-center gap-2 mb-6">
              <button 
                onClick={() => handleTypeChange('all')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${searchType === 'all' ? 'bg-[#00a859] text-white' : 'bg-[#222] text-gray-400 hover:bg-[#333]'}`}
              >
                All
              </button>
              <button 
                onClick={() => handleTypeChange('movie')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${searchType === 'movie' ? 'bg-[#00a859] text-white' : 'bg-[#222] text-gray-400 hover:bg-[#333]'}`}
              >
                Movies
              </button>
              <button 
                onClick={() => handleTypeChange('tv')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${searchType === 'tv' ? 'bg-[#00a859] text-white' : 'bg-[#222] text-gray-400 hover:bg-[#333]'}`}
              >
                Series
              </button>
            </div>

            {/* Results Grid (Search or Saved) */}
            {(searchResults.length > 0 || (!searchQuery && savedContent.length > 0)) && (
              <div>
                {!searchQuery && (
                  <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                    Saved in Database
                    {isLoadingSaved && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                  </h2>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {(searchQuery ? searchResults : savedContent).map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleSelectAnime(item)}
                      className="bg-[#1a1a1d] rounded-lg overflow-hidden cursor-pointer border border-[#333] hover:border-[#00a859] transition-colors relative group"
                    >
                      <div className="absolute top-2 right-2 z-10">
                        <span className="px-2 py-1 text-[10px] font-bold uppercase rounded bg-black/80 text-white border border-[#333]">
                          {item.media_type === 'movie' ? 'Movie' : 'Series'}
                        </span>
                      </div>
                      <div className="aspect-[2/3] relative">
                        {item.poster_path ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w342${item.poster_path}`}
                            alt={item.title || item.name}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-full h-full bg-[#222] flex items-center justify-center text-gray-500">
                            No Image
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="font-medium text-sm line-clamp-2 text-white">
                          {item.title || item.name}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!searchQuery && savedContent.length === 0 && !isLoadingSaved && (
              <div className="text-center py-10 bg-[#1a1a1d] rounded-lg border border-[#333]">
                <p className="text-gray-400">No content saved yet. Search to add.</p>
              </div>
            )}
          </div>
        )}

        {/* Editor Section */}
        {selectedItem && (
          <div className="bg-[#1a1a1d] border border-[#333] rounded-lg p-5">
            <div className="flex items-center justify-between mb-6 border-b border-[#333] pb-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-3">
                <button onClick={() => setSelectedItem(null)} className="text-gray-400 hover:text-white">
                  ← Back
                </button>
                {selectedItem.title || selectedItem.name}
              </h2>
              <span className="px-3 py-1 text-xs font-bold uppercase rounded bg-[#222] text-[#00a859] border border-[#333]">
                {selectedItem.media_type === 'movie' ? 'Movie' : 'TV Series'}
              </span>
            </div>

            <div className="flex flex-col md:flex-row gap-6">
              {/* Left: Poster */}
              <div className="w-full md:w-[200px] shrink-0">
                <div className="aspect-[2/3] rounded-lg overflow-hidden border border-[#333]">
                  {selectedItem.poster_path ? (
                    <img
                      src={`https://image.tmdb.org/t/p/w500${selectedItem.poster_path}`}
                      alt={selectedItem.title || selectedItem.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full bg-[#222] flex items-center justify-center text-gray-500">
                      No Image
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Controls */}
              <div className="flex-1 space-y-6">
                
                {/* Season & Episode Selectors */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-400 flex items-center justify-between">
                      Season
                      {isLoadingSeasons && <Loader2 className="w-3 h-3 animate-spin text-[#00a859]" />}
                    </label>
                    <select
                      value={selectedSeason}
                      onChange={(e) => handleSeasonChange(Number(e.target.value))}
                      disabled={selectedItem.media_type === 'movie' || isLoadingSeasons}
                      className="w-full bg-[#222] border border-[#333] rounded-md px-3 py-2.5 text-white focus:outline-none focus:border-[#00a859] disabled:opacity-50"
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
                    <label className="text-sm font-bold text-gray-400 flex items-center justify-between">
                      Episode
                      {isLoadingEpisodes && <Loader2 className="w-3 h-3 animate-spin text-[#00a859]" />}
                    </label>
                    <select
                      value={selectedEpisode}
                      onChange={(e) => handleEpisodeChange(Number(e.target.value))}
                      disabled={selectedItem.media_type === 'movie' || isLoadingEpisodes || selectedSeason === ''}
                      className="w-full bg-[#222] border border-[#333] rounded-md px-3 py-2.5 text-white focus:outline-none focus:border-[#00a859] disabled:opacity-50"
                    >
                      {selectedItem.media_type === 'movie' ? (
                        <option value={1}>Full Movie</option>
                      ) : (
                        episodes.map(ep => (
                          <option key={ep.episode_number} value={ep.episode_number}>
                            Ep {ep.episode_number} - {ep.name}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                {/* Server Links Manager */}
                {selectedSeason !== '' && selectedEpisode !== '' && (
                  <div className="space-y-4 bg-[#111] p-4 rounded-lg border border-[#333]">
                    <div className="flex items-center justify-between border-b border-[#333] pb-3">
                      <h3 className="text-lg font-bold text-white">
                        Manage Links
                      </h3>
                      {isLoadingServers && <Loader2 className="w-5 h-5 animate-spin text-[#00a859]" />}
                    </div>

                    <div className="space-y-3 pt-2">
                      {servers.map((server) => (
                        <div
                          key={server.id}
                          className="flex flex-col sm:flex-row gap-3 items-start sm:items-center"
                        >
                          <input
                            type="text"
                            placeholder="Server Name (e.g. Server 1)"
                            value={server.name}
                            onChange={(e) => updateServer(server.id, 'name', e.target.value)}
                            className="w-full sm:w-1/3 bg-[#222] border border-[#333] rounded-md px-3 py-2 text-white focus:outline-none focus:border-[#00a859]"
                          />
                          <input
                            type="url"
                            placeholder="https://..."
                            value={server.url}
                            onChange={(e) => updateServer(server.id, 'url', e.target.value)}
                            className="w-full flex-1 bg-[#222] border border-[#333] rounded-md px-3 py-2 text-white focus:outline-none focus:border-[#00a859] font-mono text-sm"
                          />
                          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                            <label className="flex items-center gap-2 cursor-pointer bg-[#222] px-3 py-2 rounded-md border border-[#333]">
                              <input
                                type="checkbox"
                                checked={server.isEmbed}
                                onChange={(e) => updateServer(server.id, 'isEmbed', e.target.checked)}
                                className="w-4 h-4 accent-[#00a859]"
                              />
                              <span className="text-sm text-gray-300">Embed</span>
                            </label>
                            <button
                              onClick={() => removeServerRow(server.id)}
                              className="p-2 text-gray-400 hover:text-[#e53935] transition-colors"
                              title="Remove link"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-4">
                      <button
                        onClick={addServerRow}
                        className="flex-1 py-2.5 border border-[#333] text-gray-300 hover:text-white hover:bg-[#222] rounded-md font-bold flex items-center justify-center gap-2 transition-colors"
                      >
                        <Plus className="w-4 h-4" /> ADD LINK
                      </button>
                      <button
                        onClick={saveAllServers}
                        disabled={isSaving || isLoadingServers}
                        className="flex-[2] py-2.5 bg-[#00a859] hover:bg-[#008f4c] text-white rounded-md font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                      >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        SAVE CHANGES
                      </button>
                    </div>

                    {/* Status Message */}
                    {status && (
                      <div
                        className={`p-3 rounded-md text-sm font-bold text-center ${
                          status.type === 'success' ? 'bg-[#00a859]/20 text-[#00a859] border border-[#00a859]/30' :
                          status.type === 'error' ? 'bg-[#e53935]/20 text-[#e53935] border border-[#e53935]/30' :
                          'bg-[#3b82f6]/20 text-[#3b82f6] border border-[#3b82f6]/30'
                        }`}
                      >
                        {status.message}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
