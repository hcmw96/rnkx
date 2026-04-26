interface LeagueCardProps {
  name: string;
  description: string;
  tier: 'open' | 'challenger' | 'pro' | 'elite';
}

const LeagueCard = ({ name, description, tier }: LeagueCardProps) => {
  const tierStyles = {
    open: 'border-muted-foreground/30 hover:border-muted-foreground/50',
    challenger: 'border-secondary/30 hover:border-secondary/50',
    pro: 'border-primary/30 hover:border-primary/50',
    elite: 'border-primary hover:border-primary glow-lime',
  };

  const tierBadge = {
    open: 'bg-muted-foreground/20 text-muted-foreground',
    challenger: 'bg-secondary/20 text-secondary',
    pro: 'bg-primary/20 text-primary',
    elite: 'bg-primary text-primary-foreground',
  };

  return (
    <div 
      className={`p-6 rounded-lg bg-card/50 border ${tierStyles[tier]} transition-all duration-300 flex flex-col h-full`}
    >
      <span className={`text-[10px] uppercase tracking-[0.2em] font-semibold px-2 py-1 rounded w-fit mb-4 ${tierBadge[tier]}`}>
        {name}
      </span>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {description}
      </p>
    </div>
  );
};

export default LeagueCard;
