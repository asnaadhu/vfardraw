-- Enable realtime on all draw tables so changes sync across browsers/devices

-- Set replica identity to FULL so DELETE events carry full row data
ALTER TABLE staff_members REPLICA IDENTITY FULL;
ALTER TABLE prizes REPLICA IDENTITY FULL;
ALTER TABLE winners REPLICA IDENTITY FULL;
ALTER TABLE draw_settings REPLICA IDENTITY FULL;

-- Add tables to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE staff_members;
ALTER PUBLICATION supabase_realtime ADD TABLE prizes;
ALTER PUBLICATION supabase_realtime ADD TABLE winners;
ALTER PUBLICATION supabase_realtime ADD TABLE draw_settings;
