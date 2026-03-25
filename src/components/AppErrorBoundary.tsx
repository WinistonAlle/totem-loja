import React from "react";

type AppErrorBoundaryState = {
  hasError: boolean;
};

class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Erro de renderizacao capturado pelo AppErrorBoundary:", error);
  }

  handleReload = () => {
    window.location.assign("/inicio");
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-[100dvh] bg-gradient-to-b from-[#fff7ef] via-white to-[#f4e3d3] flex items-center justify-center px-6">
        <div className="w-full max-w-[560px] rounded-[32px] border border-black/10 bg-white/92 shadow-[0_28px_70px_rgba(0,0,0,0.12)] p-8 text-center">
          <div className="text-[12px] font-black uppercase tracking-[0.22em] text-[#9E0F14]">
            Totem GM
          </div>
          <h1 className="mt-3 text-[30px] leading-tight font-extrabold text-gray-900">
            O totem precisou ser reiniciado
          </h1>
          <p className="mt-3 text-[16px] text-gray-600 font-semibold">
            Ocorreu um erro inesperado na tela atual. Toque abaixo para voltar ao inicio com segurança.
          </p>

          <button
            type="button"
            onClick={this.handleReload}
            className="mt-8 h-16 w-full rounded-[22px] bg-[#9E0F14] text-white text-[20px] font-extrabold shadow-[0_16px_40px_rgba(158,15,20,0.24)] active:scale-[0.99]"
          >
            Reiniciar totem
          </button>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
