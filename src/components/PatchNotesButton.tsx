import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

const PATCH_VERSION = "2026-06-19";
const STORAGE_KEY = "patch-notes-seen";

type Note = {
  title: string;
  items: string[];
};

const NOTES: Note[] = [
  {
    title: "Redefinição de senha pelo administrador",
    items: [
      "Agora o administrador pode redefinir a senha de qualquer usuário diretamente pela tela de administração.",
      "É possível escolher uma senha personalizada ou usar a senha padrão Logica@2026.",
      "Quando a senha padrão for usada, o usuário será solicitado a criar uma nova senha no próximo acesso.",
    ],
  },
  {
    title: "Novos perfis de usuário",
    items: [
      "Adicionamos os perfis de Líder e Coordenador, além dos perfis de Administrador e Usuário já existentes.",
      "Cada perfil tem permissões específicas de acesso às informações da equipe.",
    ],
  },
  {
    title: "Histórico da equipe",
    items: [
      "Líderes podem visualizar as comparações realizadas pelos usuários comuns.",
      "Coordenadores podem visualizar as comparações dos usuários comuns e dos líderes.",
      "Usuários comuns continuam vendo apenas as próprias comparações.",
      "A nova tela permite buscar por cliente, nome ou e-mail, filtrar por perfil e tipo de documento, além de baixar os detalhes em planilha.",
    ],
  },
  {
    title: "Painel de indicadores (Dashboard)",
    items: [
      "Nova tela exclusiva para Líderes e Coordenadores com os principais indicadores da equipe.",
      "Visualize total de comparações, divergências encontradas, diferença financeira acumulada e usuários ativos.",
      "Acompanhe a evolução diária, a distribuição por tipo de documento, os clientes com mais divergências e o desempenho de cada usuário.",
      "Filtros por período: últimos 7, 30, 90 dias ou todo o histórico.",
    ],
  },
  {
    title: "Central de novidades",
    items: [
      "Adicionamos este ícone de notificações para que você fique sempre por dentro das novidades da plataforma.",
    ],
  },
];

export function PatchNotesButton() {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(true);

  useEffect(() => {
    const last = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : PATCH_VERSION;
    setSeen(last === PATCH_VERSION);
  }, []);

  const handleOpen = (o: boolean) => {
    setOpen(o);
    if (o) {
      localStorage.setItem(STORAGE_KEY, PATCH_VERSION);
      setSeen(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => handleOpen(true)}
        className="relative"
        aria-label="Novidades"
      >
        <Bell className="h-4 w-4" />
        Novidades
        {!seen && (
          <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-primary" />
        )}
      </Button>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Novidades da plataforma
          </DialogTitle>
          <DialogDescription>
            Veja o que mudou na versão mais recente.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">Atualização</Badge>
          <span className="text-sm text-muted-foreground">19 de junho de 2026</span>
        </div>
        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-5 pt-2">
            {NOTES.map((n) => (
              <div key={n.title}>
                <h3 className="font-semibold text-base mb-2">{n.title}</h3>
                <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                  {n.items.map((it, i) => (
                    <li key={i}>{it}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
