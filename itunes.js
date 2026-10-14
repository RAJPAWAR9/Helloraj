/* ============================================================
   Booster OS — source: iTunes Search API (official, open)
   Gives search, metadata, artwork and 30-second previews.
   Returns data in the shape the app's UI already expects, so
   other sources can be dropped in beside this one.

   SOURCE INTERFACE (every source in /sources implements this):
     searchAll(q) searchSongs(q,page,limit) searchAlbums(...)
     searchArtists(...) searchPlaylists(...) getSong(id)
     getAlbum(id) getArtist(id) getArtistAlbums(id,page)
     getArtistSongs(id,page) getPlaylist(id)
   Each resolves to { data: ... } like the shapes below.
   ============================================================ */
(function(){
"use strict";
var BASE = "https://itunes.apple.com";
var COUNTRY = "IN";
var cache = new Map();

function art(u){ return u ? String(u).replace(/\d+x\d+(bb|sr)/, "600x600bb").replace(/^http:/,"https:") : ""; }
function imgs(u){ var a = art(u); return a ? [{quality:"500x500", url:a}] : []; }

async function call(path, params, signal){
  var qs = new URLSearchParams(Object.assign({country: COUNTRY}, params)).toString();
  var url = BASE + path + "?" + qs;
  var hit = cache.get(url);
  if (hit && Date.now() - hit.t < 300000) return hit.data;
  var res;
  try { res = await fetch(url, {signal: signal}); }
  catch (e) { if (e && e.name === "AbortError") throw e; throw {message: "Could not reach iTunes. Check your connection."}; }
  if (!res.ok) throw {message: "iTunes returned HTTP " + res.status};
  var json = await res.json();
  if (cache.size > 80) cache.delete(cache.keys().next().value);
  cache.set(url, {t: Date.now(), data: json});
  return json;
}

function toSong(r){
  var preview = r.previewUrl || "";
  var dl = preview ? [
    {quality:"96kbps",  url: preview},
    {quality:"160kbps", url: preview},
    {quality:"320kbps", url: preview}
  ] : [];
  return {
    id: String(r.trackId), name: r.trackName || "Untitled",
    duration: Math.round((r.trackTimeMillis || 0) / 1000),
    year: (r.releaseDate || "").slice(0,4), language: "",
    image: imgs(r.artworkUrl100),
    artists: { primary: [{ id: String(r.artistId || ""), name: r.artistName || "Unknown Artist" }] },
    album: { id: String(r.collectionId || ""), name: r.collectionName || "" },
    downloadUrl: dl, hasLyrics: false
  };
}
function toAlbum(r, songs){
  return {
    id: String(r.collectionId), name: r.collectionName || "Untitled Album",
    image: imgs(r.artworkUrl100), year: (r.releaseDate || "").slice(0,4), language: "",
    artists: { primary: [{ id: String(r.artistId || ""), name: r.artistName || "" }] },
    songCount: r.trackCount || (songs ? songs.length : 0), songs: songs || null
  };
}
function toArtist(r, topSongs){
  return { id: String(r.artistId), name: r.artistName || "Unknown Artist", image: [],
    followerCount: 0, bio: [], topSongs: topSongs || [] };
}
function songsOnly(json){ return (json.results || []).filter(function(x){ return x.wrapperType === "track" && x.kind === "song"; }); }

var Source = {
  id: "itunes", name: "iTunes (30s previews)",

  async searchSongs(q, page, limit, signal){
    page = page || 0; limit = limit || 20;
    var j = await call("/search", {term:q, entity:"song", media:"music", limit: Math.min(200, (page+1)*limit)}, signal);
    var rows = songsOnly(j).slice(page*limit, page*limit + limit).map(toSong);
    return {success:true, data:{results: rows}};
  },
  async searchAlbums(q, page, limit, signal){
    page = page || 0; limit = limit || 20;
    var j = await call("/search", {term:q, entity:"album", media:"music", limit: Math.min(200, (page+1)*limit)}, signal);
    var rows = (j.results || []).slice(page*limit, page*limit + limit).map(function(r){ return toAlbum(r); });
    return {success:true, data:{results: rows}};
  },
  async searchArtists(q, page, limit, signal){
    page = page || 0; limit = limit || 20;
    var j = await call("/search", {term:q, entity:"musicArtist", media:"music", limit: Math.min(200, (page+1)*limit)}, signal);
    var rows = (j.results || []).slice(page*limit, page*limit + limit).map(function(r){ return toArtist(r); });
    return {success:true, data:{results: rows}};
  },
  async searchPlaylists(){ return {success:true, data:{results: []}}; },

  async searchAll(q, signal){
    var r = await Promise.all([
      Source.searchSongs(q, 0, 8, signal), Source.searchAlbums(q, 0, 6, signal), Source.searchArtists(q, 0, 6, signal)
    ]);
    return {success:true, data:{
      songs:   {results: r[0].data.results.map(function(s){ return {id:s.id, title:s.name, image:s.image, singers:s.artists.primary[0].name, album:s.album.name}; })},
      albums:  {results: r[1].data.results.map(function(a){ return {id:a.id, title:a.name, image:a.image, description:a.artists.primary[0].name}; })},
      artists: {results: r[2].data.results.map(function(a){ return {id:a.id, title:a.name, image:a.image}; })},
      playlists: {results: []}
    }};
  },

  async getSong(id, signal){
    var j = await call("/lookup", {id:id, entity:"song"}, signal);
    var s = songsOnly(j)[0];
    if (!s) throw {message: "Song not found."};
    return {success:true, data:[toSong(s)]};
  },
  async getAlbum(id, signal){
    var j = await call("/lookup", {id:id, entity:"song", limit:200}, signal);
    var res = j.results || [];
    var coll = res.find(function(x){ return x.wrapperType === "collection"; });
    if (!coll) throw {message: "Album not found."};
    var songs = songsOnly(j).map(toSong);
    return {success:true, data: toAlbum(coll, songs)};
  },
  async getArtist(id, signal){
    var jA = await call("/lookup", {id:id}, signal);
    var a = (jA.results || [])[0];
    if (!a) throw {message: "Artist not found."};
    var jS = await call("/lookup", {id:id, entity:"song", limit:25}, signal);
    return {success:true, data: toArtist(a, songsOnly(jS).map(toSong))};
  },
  async getArtistAlbums(id, page, signal){
    if (page) return {success:true, data:{albums: []}};
    var j = await call("/lookup", {id:id, entity:"album", limit:50}, signal);
    var rows = (j.results || []).filter(function(x){ return x.wrapperType === "collection"; }).map(function(r){ return toAlbum(r); });
    return {success:true, data:{albums: rows}};
  },
  async getArtistSongs(id, page, signal){
    if (page) return {success:true, data:{songs: []}};
    var j = await call("/lookup", {id:id, entity:"song", limit:200}, signal);
    return {success:true, data:{songs: songsOnly(j).map(toSong)}};
  },
  async getPlaylist(){ throw {message: "Playlists are not available from this source."}; }
};

window.BoosterSources = window.BoosterSources || {};
window.BoosterSources.itunes = Source;
window.BoosterSources.active = Source;
})();
