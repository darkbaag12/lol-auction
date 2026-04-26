package com.gyeongmae.auction.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "auction_round")
@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuctionRound {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tournament_id", nullable = false)
    private Tournament tournament;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "player_id", nullable = false)
    private Player player;

    @Column(nullable = false)
    private int roundNumber;

    @Column(nullable = false)
    private int startingPrice;

    private Integer finalPrice;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "winning_team_id")
    private Team winningTeam;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private AuctionRoundStatus status = AuctionRoundStatus.WAITING;

    private LocalDateTime startedAt;

    private LocalDateTime endedAt;
    
    @Column(name = "is_re_auction", nullable = false, columnDefinition = "boolean default false")
    @Builder.Default
    private boolean isReAuction = false;

    @OneToMany(mappedBy = "auctionRound", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<Bid> bids = new ArrayList<>();

    public int getCurrentHighestBid() {
        return bids.stream()
                .mapToInt(Bid::getBidAmount)
                .max()
                .orElse(startingPrice);
    }

    public enum AuctionRoundStatus {
        WAITING, ACTIVE, SOLD, UNSOLD
    }
}
