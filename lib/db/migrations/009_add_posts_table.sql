-- Posts table — social media content plan items
-- Each row = one scheduled post, imported from the monthly XLSX content plan
-- One campaign (project) holds all posts for that project in that month

CREATE TABLE IF NOT EXISTS posts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  post_number   INTEGER,
  fecha         DATE,
  idea          TEXT,
  caption       TEXT,
  texto_en_arte TEXT,
  hashtags      TEXT,
  formato       VARCHAR(50),   -- 'Post' | 'Carrusel'
  plataforma    VARCHAR(100),
  estatus       VARCHAR(50) DEFAULT 'Pendiente',
  image_id      UUID REFERENCES images(id) ON DELETE SET NULL,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_posts_project_id ON posts(project_id);
CREATE INDEX IF NOT EXISTS idx_posts_fecha      ON posts(fecha);
CREATE INDEX IF NOT EXISTS idx_posts_estatus    ON posts(estatus);
