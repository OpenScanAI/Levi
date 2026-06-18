-- Add 'cancelling' to research_session_status enum
-- PostgreSQL requires ALTER TYPE ... ADD VALUE for enum modifications
ALTER TYPE "research_session_status" ADD VALUE IF NOT EXISTS 'cancelling';
