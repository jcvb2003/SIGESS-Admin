import { toast } from "sonner";

export function handleSupabaseError(error: unknown): never {
  let message = "Ocorreu um erro inesperado no banco de dados.";
  
  if (error && typeof error === 'object' && 'message' in error) {
    message = (error as { message: string }).message;
  }
  
  console.error("Supabase Error:", error);
  
  // Opcionalmente mostrar toast aqui se quiser centralizar, 
  // mas hooks costumam preferir onError do Mutation.
  toast.error(message);

  throw new Error(message);
}
