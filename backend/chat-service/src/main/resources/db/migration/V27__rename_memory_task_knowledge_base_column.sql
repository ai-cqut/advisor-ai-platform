-- Align the memory task schema with the knowledgeBaseId entity property.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'memory_task'
          AND column_name = 'kb_id'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'memory_task'
          AND column_name = 'knowledge_base_id'
    ) THEN
        ALTER TABLE memory_task RENAME COLUMN kb_id TO knowledge_base_id;
    END IF;
END
$$;
