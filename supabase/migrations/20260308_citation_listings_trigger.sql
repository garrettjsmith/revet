-- Add missing updated_at trigger for citation_listings table.
-- All other tables with updated_at already have this trigger.

CREATE TRIGGER citation_listings_updated_at
  BEFORE UPDATE ON citation_listings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
