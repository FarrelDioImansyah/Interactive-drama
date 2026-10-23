// ==============================================================================
// MAFIA SYNDICATE VOTING ENGINE (SUPABASE REALTIME + LOCALSTORAGE FALLBACK)
// ==============================================================================

const _cfg = window.APP_CONFIG || {};
const SUPABASE_CONFIG = {
  url: _cfg.SUPABASE_URL || localStorage.getItem('MAFIA_SUPABASE_URL') || '',
  anonKey: _cfg.SUPABASE_ANON_KEY || localStorage.getItem('MAFIA_SUPABASE_ANON') || ''
};

let supabaseClient = null;
if (window.supabase && SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey) {
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });
    console.log("Connected to Supabase Syndicate Database.");
  } catch (err) {
    console.error("Supabase connection error:", err);
  }
}

// Helper untuk membersihkan label dari teks Good Ending, Bad Ending, Secret Ending, dsb.
function filterEndingText(text) {
  if (!text) return '';
  return text
    .replace(/^\[?(good|bad|happy|sad|secret|seccret)\s*(ending)?\]?\s*[:-]?\s*/gi, '')
    .replace(/\b(good|bad|happy|sad|secret|seccret)\s*ending:?\b/gi, '')
    .trim();
}
window.filterEndingText = filterEndingText;

// Default Seed Data untuk offline fallback / initial placeholder
const DEFAULT_STATE = {
  show: {
    id: 'show-mafia-01',
    title: 'THE WEAKLING: SYNDICATE JUDGMENT'
  },
  polls: [
    {
      id: 'poll-scene-2',
      scene: 2,
      title: 'SCENE 2 — UNDERBOSS DILEMMA',
      question: 'Jika kalian berada di posisi Radit saat berhadapan dengan tekanan sindikat, apa yang akan kalian lakukan?',
      status: 'closed',
      options: [
        {
          id: 'opt-2-a',
          code: 'A',
          label: 'Membantu Sultan',
          desc: '',
          votesCount: 0
        },
        {
          id: 'opt-2-b',
          code: 'B',
          label: 'Tidak Membantu Sultan',
          desc: '',
          votesCount: 0
        }
      ]
    },
    {
      id: 'poll-scene-3',
      scene: 3,
      title: 'SCENE 3 — BLOOD & BETRAYAL',
      question: 'Apa langkah strategis Radit ketika intimidasi dan perundungan kian tak terkendali?',
      status: 'draft',
      options: [
        {
          id: 'opt-3-a',
          code: 'A',
          label: 'Mengalihkan Perhatian',
          desc: '',
          votesCount: 0
        },
        {
          id: 'opt-3-b',
          code: 'B',
          label: 'Menahan Diri',
          desc: '',
          votesCount: 0
        }
      ]
    },
    {
      id: 'poll-scene-4',
      scene: 4,
      title: 'SCENE 4 — THE FINAL GODFATHER ACT',
      question: 'Bagaimana Radit akan menggunakan kekuasaan puncaknya untuk menuntaskan takdir pertunjukan?',
      status: 'draft',
      options: [
        {
          id: 'opt-4-a',
          code: 'A',
          label: 'Keadilan',
          desc: '',
          votesCount: 0
        },
        {
          id: 'opt-4-b',
          code: 'B',
          label: 'Balas Dendam',
          desc: '',
          votesCount: 0
        },
        {
          id: 'opt-4-c',
          code: 'C',
          label: 'Rencana Balik Topeng',
          desc: '',
          votesCount: 0
        }
      ]
    }
  ],
  votes: {}
};

const STORAGE_KEY = 'MAFIA_VOTE_LOCAL_STATE';

class MafiaEngine {
  constructor() {
    this.listeners = [];
    this.supabase = supabaseClient;
    this.broadcastChannel = null;
    this.state = this.loadState();

    // Dengarkan perubahan antar tab browser lokal
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY) {
        this.state = this.loadState();
        this.notify();
      }
    });

    // Inisialisasi Supabase sync dan realtime
    if (this.supabase) {
      this.initSupabaseRealtime();
      this.fetchFromSupabase();
    }
  }

  loadState() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed && parsed.polls) {
          parsed.polls.forEach(p => {
            if (p.options) {
              p.options.forEach(o => {
                o.label = filterEndingText(o.label);
                o.desc = '';
              });
            }
          });
        }
        return parsed;
      }
    } catch (e) {
      console.warn("Error loading stored state, resetting to default", e);
    }
    this.saveState(DEFAULT_STATE);
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }

  saveState(state) {
    this.state = state;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
    this.notify();
  }

  subscribe(callback) {
    this.listeners.push(callback);
    callback(this.state);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  notify() {
    this.listeners.forEach(cb => {
      try {
        cb(this.state);
      } catch (err) {
        console.error("Subscriber notification error:", err);
      }
    });
  }

  getVoterToken() {
    let token = localStorage.getItem('MAFIA_VOTER_TOKEN');
    if (!token) {
      token = 'don_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
      localStorage.setItem('MAFIA_VOTER_TOKEN', token);
    }
    return token;
  }

  hasVoted(pollId) {
    const token = this.getVoterToken();
    return !!(this.state.votes[pollId] && this.state.votes[pollId][token]);
  }

  getUserVote(pollId) {
    const token = this.getVoterToken();
    if (this.state.votes[pollId]) {
      return this.state.votes[pollId][token] || null;
    }
    return null;
  }

  // Tarik data lengkap langsung dari Supabase
  async fetchFromSupabase() {
    if (!this.supabase) return;

    try {
      const [showsRes, pollsRes, optionsRes, votesRes] = await Promise.all([
        this.supabase.from('shows').select('*').limit(1),
        this.supabase.from('polls').select('*').order('scene', { ascending: true }),
        this.supabase.from('poll_options').select('*').order('sort_order', { ascending: true }),
        this.supabase.from('votes').select('*')
      ]);

      if (pollsRes.error || optionsRes.error) {
        console.warn("Supabase fetch warning:", pollsRes.error || optionsRes.error);
        return;
      }

      const pollsData = pollsRes.data || [];
      const optionsData = optionsRes.data || [];
      const votesData = votesRes.data || [];
      const showsData = showsRes.data || [];

      if (pollsData.length === 0) return;

      const votesMap = {};
      votesData.forEach(v => {
        if (!votesMap[v.poll_id]) votesMap[v.poll_id] = {};
        votesMap[v.poll_id][v.voter_token] = v.option_id;
      });

      const assembledPolls = pollsData.map(p => {
        const opts = optionsData
          .filter(o => o.poll_id === p.id)
          .map(o => {
            const count = votesData.filter(v => v.poll_id === p.id && v.option_id === o.id).length;
            return {
              id: o.id,
              code: o.code,
              label: filterEndingText(o.label),
              desc: '',
              votesCount: count
            };
          });

        return {
          id: p.id,
          scene: p.scene,
          title: p.title,
          question: p.question,
          status: p.status, // draft, open, closed
          options: opts
        };
      });

      this.state = {
        show: showsData[0] ? { id: showsData[0].id, title: showsData[0].title } : this.state.show,
        polls: assembledPolls,
        votes: votesMap
      };

      this.saveState(this.state);
    } catch (err) {
      console.error("Failed to sync from Supabase:", err);
    }
  }

  // Setup Realtime Channel
  initSupabaseRealtime() {
    if (!this.supabase) return;

    // 1. Channel Postgres DB Changes
    this.supabase
      .channel('public_db_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'polls' }, async () => {
        console.log("Realtime: Polls table updated");
        await this.fetchFromSupabase();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, async () => {
        console.log("Realtime: Votes table updated");
        await this.fetchFromSupabase();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shows' }, async () => {
        await this.fetchFromSupabase();
      })
      .subscribe((status) => {
        console.log("Supabase DB realtime status:", status);
      });

    // 2. Channel Broadcast instan (<50ms serentak antar semua HP)
    this.broadcastChannel = this.supabase.channel('mafia_broadcast_room');
    this.broadcastChannel
      .on('broadcast', { event: 'poll_update' }, async (payload) => {
        console.log("Realtime Broadcast received:", payload);
        await this.fetchFromSupabase();
      })
      .subscribe((status) => {
        console.log("Supabase Broadcast realtime status:", status);
      });
  }

  // Kirim suara penonton (FR-04, FR-05, FR-08)
  submitVote(pollId, optionId) {
    const poll = this.state.polls.find(p => p.id === pollId);
    if (!poll) return { success: false, message: 'Sesi tidak ditemukan' };
    if (poll.status !== 'open') return { success: false, message: 'Voting sedang tidak dibuka!' };

    const token = this.getVoterToken();
    if (this.hasVoted(pollId)) {
      return { success: false, message: 'Anda sudah menggunakan hak suara pada adegan ini!' };
    }

    // Catat secara lokal terlebih dahulu untuk feedback UI cepat
    if (!this.state.votes[pollId]) {
      this.state.votes[pollId] = {};
    }
    this.state.votes[pollId][token] = optionId;

    const option = poll.options.find(o => o.id === optionId);
    if (option) {
      option.votesCount = (option.votesCount || 0) + 1;
    }
    this.saveState(this.state);

    // Kirim asinkron ke Supabase jika client aktif
    if (this.supabase) {
      this.supabase
        .from('votes')
        .insert([{
          poll_id: pollId,
          option_id: optionId,
          voter_token: token
        }])
        .then(({ error }) => {
          if (error) console.error("Error inserting vote:", error);
          if (this.broadcastChannel) {
            this.broadcastChannel.send({
              type: 'broadcast',
              event: 'poll_update',
              payload: { type: 'vote', pollId }
            });
          }
        })
        .catch(err => console.error("Vote network error:", err));
    }

    return { success: true, message: 'Keputusan Mafia berhasil dicatat!' };
  }

  // Kontrol Admin: Ubah status voting sesi (open / closed / draft)
  async setPollStatus(pollId, newStatus) {
    // 1. Optimistic update lokal
    const poll = this.state.polls.find(p => p.id === pollId);
    if (poll) {
      if (newStatus === 'open') {
        this.state.polls.forEach(p => {
          if (p.id !== pollId && p.status === 'open') {
            p.status = 'closed';
          }
        });
      }
      poll.status = newStatus;
      this.saveState(this.state);
    }

    // 2. Kirim update ke database Supabase
    if (this.supabase) {
      try {
        if (newStatus === 'open') {
          // Tutup poll lain di database agar hanya 1 sesi yang aktif serentak
          await this.supabase
            .from('polls')
            .update({ status: 'closed', closed_at: new Date().toISOString() })
            .neq('id', pollId)
            .eq('status', 'open');
        }

        const updatePayload = { status: newStatus };
        if (newStatus === 'open') updatePayload.opened_at = new Date().toISOString();
        if (newStatus === 'closed') updatePayload.closed_at = new Date().toISOString();

        const { error } = await this.supabase
          .from('polls')
          .update(updatePayload)
          .eq('id', pollId);

        if (error) {
          console.error("Supabase setPollStatus error:", error);
        }

        // 3. Broadcast sinyal serentak ke seluruh HP penonton
        if (this.broadcastChannel) {
          this.broadcastChannel.send({
            type: 'broadcast',
            event: 'poll_update',
            payload: { pollId, newStatus }
          });
        }
      } catch (err) {
        console.error("Error executing setPollStatus:", err);
      }
    }
  }

  // Reset Sesi Drama untuk Pertunjukan Baru
  async resetShow(newTitle) {
    if (this.supabase) {
      try {
        // Hapus seluruh vote di Supabase
        await this.supabase.from('votes').delete().neq('voter_token', '__never__');

        // Set semua sesi kembali ke draft
        await this.supabase.from('polls').update({
          status: 'draft',
          opened_at: null,
          closed_at: null
        }).neq('title', '__never__');

        if (newTitle) {
          await this.supabase.from('shows').update({ title: newTitle }).neq('title', '__never__');
        }

        await this.fetchFromSupabase();

        if (this.broadcastChannel) {
          this.broadcastChannel.send({
            type: 'broadcast',
            event: 'poll_update',
            payload: { action: 'reset' }
          });
        }
      } catch (err) {
        console.error("Reset error:", err);
      }
    } else {
      const fresh = JSON.parse(JSON.stringify(DEFAULT_STATE));
      if (newTitle) fresh.show.title = newTitle;
      this.saveState(fresh);
    }
  }

  getActivePoll() {
    return this.state.polls.find(p => p.status === 'open') || null;
  }

  getPollResults(pollId) {
    const poll = this.state.polls.find(p => p.id === pollId);
    if (!poll) return null;

    let total = 0;
    poll.options.forEach(opt => {
      total += (opt.votesCount || 0);
    });

    const optionsWithPercent = poll.options.map(opt => {
      const count = opt.votesCount || 0;
      const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
      return {
        ...opt,
        label: filterEndingText(opt.label),
        desc: '',
        count,
        percentage: Number(percentage)
      };
    });

    let maxVotes = -1;
    let winner = null;
    let isTie = false;

    if (total > 0) {
      optionsWithPercent.forEach(opt => {
        if (opt.count > maxVotes) {
          maxVotes = opt.count;
          winner = {
            ...opt,
            label: filterEndingText(opt.label)
          };
          isTie = false;
        } else if (opt.count === maxVotes && maxVotes > 0) {
          isTie = true;
        }
      });
    }

    return {
      poll,
      totalVotes: total,
      options: optionsWithPercent,
      winner: isTie ? null : winner,
      isTie
    };
  }
}

// Inisialisasi Single Instance Engine
window.mafiaEngine = new MafiaEngine();
