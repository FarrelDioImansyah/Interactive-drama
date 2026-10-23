-- ==============================================================================
-- SCHEMA SISTEM VOTING DRAMA PENTAS SENI - THE WEAKLING (MAFIA SYNDICATE EDITION)
-- Jalankan skrip ini di SQL Editor Supabase Anda
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABEL: shows
CREATE TABLE IF NOT EXISTS public.shows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL DEFAULT 'The Weakling: Mafia Syndicate Live',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. TABEL: polls
CREATE TABLE IF NOT EXISTS public.polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    show_id UUID NOT NULL REFERENCES public.shows(id) ON DELETE CASCADE,
    scene INT NOT NULL, -- 2, 3, atau 4
    title TEXT NOT NULL,
    question TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'closed' CHECK (status IN ('draft', 'open', 'closed')),
    opened_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. TABEL: poll_options
CREATE TABLE IF NOT EXISTS public.poll_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
    code TEXT NOT NULL, -- 'A', 'B', 'C'
    label TEXT NOT NULL,
    description TEXT DEFAULT '',
    sort_order INT NOT NULL DEFAULT 0
);

-- 5. TABEL: votes
CREATE TABLE IF NOT EXISTS public.votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
    option_id UUID NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
    voter_token TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_vote_per_voter_per_poll UNIQUE (poll_id, voter_token)
);

-- 6. ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.shows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

-- 7. POLICIES (Publik dapat membaca info shows, polls, poll_options, dan votes untuk hasil agregasi)
CREATE POLICY "Public can view shows" ON public.shows FOR SELECT USING (true);
CREATE POLICY "Public can view polls" ON public.polls FOR SELECT USING (true);
CREATE POLICY "Public can view options" ON public.poll_options FOR SELECT USING (true);
CREATE POLICY "Public can view votes" ON public.votes FOR SELECT USING (true);

-- Policy untuk insert vote (Penonton bisa memilih jika poll status = open)
CREATE POLICY "Public can vote when poll isOpen" ON public.votes FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.polls 
        WHERE polls.id = poll_id AND polls.status = 'open'
    )
);

-- Policy admin (Authenticated user atau service role)
CREATE POLICY "Authenticated users manage shows" ON public.shows FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users manage polls" ON public.polls FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users manage poll_options" ON public.poll_options FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users manage votes" ON public.votes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 8. REALTIME REPLICATION CONFIGURATION
-- Pastikan tabel-tabel ini dimasukkan ke publikasi supabase_realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.shows;
ALTER PUBLICATION supabase_realtime ADD TABLE public.polls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.poll_options;
ALTER PUBLICATION supabase_realtime ADD TABLE public.votes;

-- 9. DATA AWAL (SEED DATA DEFAULT)
DO $$
DECLARE
    v_show_id UUID;
    v_poll_2_id UUID;
    v_poll_3_id UUID;
    v_poll_4_id UUID;
BEGIN
    -- Masukkan pertunjukan default
    INSERT INTO public.shows (title, is_active)
    VALUES ('The Weakling: Syndicate Judgment Day', true)
    RETURNING id INTO v_show_id;

    -- SCENE 2
    INSERT INTO public.polls (show_id, scene, title, question, status)
    VALUES (
        v_show_id,
        2,
        'Scene 2 — Underboss Dilemma',
        'Jika kalian berada di posisi Radit di hadapan tekanan sindikat, apa yang akan kalian lakukan?',
        'draft'
    ) RETURNING id INTO v_poll_2_id;

    INSERT INTO public.poll_options (poll_id, code, label, description, sort_order) VALUES
    (v_poll_2_id, 'A', 'Membantu Sultan', '', 1),
    (v_poll_2_id, 'B', 'Tidak Membantu Sultan', '', 2);

    -- SCENE 3
    INSERT INTO public.polls (show_id, scene, title, question, status)
    VALUES (
        v_show_id,
        3,
        'Scene 3 — Blood & Betrayal',
        'Apa yang sebaiknya Radit lakukan ketika intimidasi dan perundungan semakin tak terkendali?',
        'draft'
    ) RETURNING id INTO v_poll_3_id;

    INSERT INTO public.poll_options (poll_id, code, label, description, sort_order) VALUES
    (v_poll_3_id, 'A', 'Mengalihkan Perhatian', '', 1),
    (v_poll_3_id, 'B', 'Menahan Diri', '', 2);

    -- SCENE 4
    INSERT INTO public.polls (show_id, scene, title, question, status)
    VALUES (
        v_show_id,
        4,
        'Scene 4 — The Final Godfather Act',
        'Bagaimana Radit akan menggunakan kekuasaan puncaknya untuk mengakhiri perseteruan ini?',
        'draft'
    ) RETURNING id INTO v_poll_4_id;

    INSERT INTO public.poll_options (poll_id, code, label, description, sort_order) VALUES
    (v_poll_4_id, 'A', 'Keadilan', '', 1),
    (v_poll_4_id, 'B', 'Balas Dendam', '', 2),
    (v_poll_4_id, 'C', 'Rencana di Balik Penyamaran', '', 3);

END $$;
