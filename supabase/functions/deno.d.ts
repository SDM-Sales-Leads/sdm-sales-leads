// type shim so `tsc` can check the edge function without Deno installed
declare module "npm:@supabase/supabase-js@2" {
  export * from "@supabase/supabase-js";
}
