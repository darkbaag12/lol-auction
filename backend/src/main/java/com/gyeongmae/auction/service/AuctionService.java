package com.gyeongmae.auction.service;

import com.gyeongmae.auction.dto.*;
import com.gyeongmae.auction.entity.*;
import com.gyeongmae.auction.entity.AuctionRound.AuctionRoundStatus;
import com.gyeongmae.auction.entity.Player.PlayerStatus;
import com.gyeongmae.auction.entity.Tournament.TournamentStatus;
import com.gyeongmae.auction.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.apache.poi.ss.usermodel.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AuctionService {

    private final TournamentRepository tournamentRepository;
    private final TeamRepository teamRepository;
    private final PlayerRepository playerRepository;
    private final AuctionRoundRepository auctionRoundRepository;
    private final BidRepository bidRepository;
    private final TeamMemberRepository teamMemberRepository;
    private final SimpMessagingTemplate messagingTemplate;

    // ==================== Tournament ====================

    @Transactional
    public TournamentDto.Response createTournament(TournamentDto.CreateRequest request) {
        Tournament tournament = Tournament.builder()
                .name(request.getName())
                .totalPoints(request.getTotalPoints() > 0 ? request.getTotalPoints() : 1000)
                .bidUnit(request.getBidUnit() > 0 ? request.getBidUnit() : 5)
                .maxTeamSize(request.getMaxTeamSize() > 0 ? request.getMaxTeamSize() : 5)
                .accessCode(request.getAccessCode())
                .build();
        tournament = tournamentRepository.save(tournament);
        return toTournamentResponse(tournament);
    }

    @Transactional(readOnly = true)
    public List<TournamentDto.Response> getTournaments() {
        return tournamentRepository.findAll().stream()
                .map(this::toTournamentResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public void deleteTournament(Long tournamentId) {
        Tournament tournament = tournamentRepository.findById(tournamentId)
                .orElseThrow(() -> new IllegalArgumentException("Tournament not found"));
        // Detach all players (clear team reference) to avoid FK constraint violations
        List<Player> players = playerRepository.findByTournamentId(tournamentId);
        for (Player p : players) {
            p.setTeam(null);
            playerRepository.save(p);
        }
        // Delete all teams (members cascade via OneToMany CascadeType.ALL)
        List<Team> teams = teamRepository.findByTournamentId(tournamentId);
        teamRepository.deleteAll(teams);
        // Delete all players
        playerRepository.deleteAll(players);
        // Finally delete the tournament
        tournamentRepository.delete(tournament);
    }

    @Transactional
    public void setAccessCode(Long tournamentId, String code) {
        Tournament tournament = tournamentRepository.findById(tournamentId)
                .orElseThrow(() -> new IllegalArgumentException("Tournament not found"));
        tournament.setAccessCode(code == null || code.isBlank() ? null : code);
        tournamentRepository.save(tournament);
    }

    @Transactional(readOnly = true)
    public boolean verifyAccessCode(Long tournamentId, String code) {
        Tournament tournament = tournamentRepository.findById(tournamentId)
                .orElseThrow(() -> new IllegalArgumentException("Tournament not found"));
        // 코드가 없으면 누구나 입장 가능
        if (tournament.getAccessCode() == null || tournament.getAccessCode().isBlank()) return true;
        return tournament.getAccessCode().equals(code);
    }

    @Transactional(readOnly = true)
    public TournamentDto.Response getTournament(Long id) {
        Tournament tournament = tournamentRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Tournament not found: " + id));
        return toTournamentResponse(tournament);
    }

    @Transactional(readOnly = true)
    public TournamentDto.Response getLatestTournament() {
        Tournament tournament = tournamentRepository.findTopByOrderByIdDesc()
                .orElse(null);
        return tournament != null ? toTournamentResponse(tournament) : null;
    }

    // ==================== Team ====================

    @Transactional
    public TeamDto.Response createTeam(Long tournamentId, TeamDto.CreateRequest request) {
        Tournament tournament = tournamentRepository.findById(tournamentId)
                .orElseThrow(() -> new IllegalArgumentException("Tournament not found"));

        int initialPoints = (request.getStartingPoints() != null && request.getStartingPoints() > 0)
                ? request.getStartingPoints()
                : tournament.getTotalPoints();

        Team team = Team.builder()
                .tournament(tournament)
                .name(request.getName())
                .captainName(request.getCaptainName())
                .remainingPoints(initialPoints)
                .build();
        team = teamRepository.save(team);
        return toTeamResponse(team);
    }

    @Transactional(readOnly = true)
    public List<TeamDto.Response> getTeams(Long tournamentId) {
        return teamRepository.findByTournamentId(tournamentId).stream()
                .map(this::toTeamResponse)
                .collect(Collectors.toList());
    }

    @Transactional
    public void deleteTeam(Long tournamentId, Long teamId) {
        Team team = teamRepository.findById(teamId)
                .orElseThrow(() -> new IllegalArgumentException("Team not found"));
        // Ensure the team belongs to the tournament
        if (!team.getTournament().getId().equals(tournamentId)) {
            throw new IllegalArgumentException("Team does not belong to this tournament");
        }
        
        // Detach players from the team to bypass foreign key constraints
        List<Player> players = playerRepository.findByTournamentId(tournamentId);
        for (Player p : players) {
            if (p.getTeam() != null && p.getTeam().getId().equals(teamId)) {
                p.setTeam(null);
                p.setSoldPrice(null);
                p.setStatus(Player.PlayerStatus.AVAILABLE); // Or UNSOLD depending on context, keeping AVAILABLE puts them back in pool
                playerRepository.save(p);
            }
        }
        
        teamRepository.delete(team);
    }

    // ==================== Player ====================

    @Transactional
    public PlayerDto.Response createPlayer(Long tournamentId, PlayerDto.CreateRequest request) {
        Tournament tournament = tournamentRepository.findById(tournamentId)
                .orElseThrow(() -> new IllegalArgumentException("Tournament not found"));

        Player player = Player.builder()
                .tournament(tournament)
                .name(request.getName() != null ? request.getName() : request.getSummonerName())
                .summonerName(request.getSummonerName())
                .tier(request.getTier())
                .rankDivision(request.getRankDivision())
                .lp(request.getLp())
                .mainPosition(request.getMainPosition())
                .subPosition(request.getSubPosition())
                .mostChampions(request.getMostChampions())
                .isNewMember(request.getIsNewMember() != null ? request.getIsNewMember() : false)
                .profileIconUrl(request.getProfileIconUrl())
                .build();
        player = playerRepository.save(player);
        return toPlayerResponse(player);
    }


    @Transactional
    public List<PlayerDto.Response> createPlayersBulk(Long tournamentId, List<PlayerDto.CreateRequest> requests) {
        return requests.stream()
                .map(req -> createPlayer(tournamentId, req))
                .collect(Collectors.toList());
    }

    @Transactional
    public List<PlayerDto.Response> importPlayersFromExcel(Long tournamentId, MultipartFile file) {
        Tournament tournament = tournamentRepository.findById(tournamentId)
                .orElseThrow(() -> new IllegalArgumentException("Tournament not found"));

        // Delete all existing players for this tournament to overwrite instead of append
        List<Player> existingPlayers = playerRepository.findByTournamentId(tournamentId);
        if (!existingPlayers.isEmpty()) {
            playerRepository.deleteAll(existingPlayers);
        }

        List<Player> importedPlayers = new ArrayList<>();
        try (InputStream is = file.getInputStream();
             Workbook workbook = WorkbookFactory.create(is)) {

            Sheet sheet = workbook.getSheetAt(0);
            boolean isHeader = true;

            int nameIdx = 0, summonerIdx = 1, tierIdx = 2, mainPosIdx = 3, subPosIdx = 4, champsIdx = 5;
            int isNewMemberIdx = -1, isCaptainAppliedIdx = -1;

            for (Row row : sheet) {
                if (isHeader) {
                    isHeader = false;
                    for (Cell cell : row) {
                        String rawHeader = getCellValueAsString(cell);
                        String header = rawHeader.trim().replace(" ", "");
                        System.out.println("HEADER DUMP [" + cell.getColumnIndex() + "]: " + rawHeader + " -> " + header);
                        if (header.contains("성명") || header.contains("이름")) nameIdx = cell.getColumnIndex();
                        else if (header.contains("닉네임")) summonerIdx = cell.getColumnIndex();
                        else if (header.contains("티어")) tierIdx = cell.getColumnIndex();
                        else if (header.contains("주라인") || header.contains("주포지션")) mainPosIdx = cell.getColumnIndex();
                        else if (header.contains("부라인") || header.contains("부포지션")) subPosIdx = cell.getColumnIndex();
                        else if (header.contains("선호챔피언") || header.contains("모스트")) champsIdx = cell.getColumnIndex();
                        else if (header.contains("팀장지원여부") || header.equals("팀장여부") || header.equals("팀장")) isCaptainAppliedIdx = cell.getColumnIndex();
                        else if (header.contains("신입회원여부") || header.equals("신입여부") || header.equals("신입")) isNewMemberIdx = cell.getColumnIndex();
                    }
                    continue;
                }

                // Check for empty rows
                Cell nameCell = row.getCell(nameIdx);
                Cell summonerCell = row.getCell(summonerIdx);
                if ((nameCell == null || nameCell.getCellType() == CellType.BLANK) &&
                    (summonerCell == null || summonerCell.getCellType() == CellType.BLANK)) {
                    continue;
                }

                String name = getCellValueAsString(row.getCell(nameIdx));
                String summonerName = getCellValueAsString(row.getCell(summonerIdx)); // Nickname#Tag
                
                System.out.println("ROW DUMP: " + name + " / " + summonerName + " / captain:" + (isCaptainAppliedIdx != -1 ? getCellValueAsString(row.getCell(isCaptainAppliedIdx)) : "null"));
                
                // 팀장 지원 여부가 O, ㅇ, 0, Y 등인 경우 건너뛰기
                if (isCaptainAppliedIdx != -1) {
                    String captainApplied = getCellValueAsString(row.getCell(isCaptainAppliedIdx)).trim().toUpperCase();
                    if (captainApplied.equals("O") || captainApplied.equals("0") || captainApplied.equals("ㅇ") || captainApplied.equals("Y") || captainApplied.equals("TRUE") || captainApplied.contains("팀장")) {
                        continue;
                    }
                }

                String tierString = getCellValueAsString(row.getCell(tierIdx)); // ex: E1, G3
                String mainPositionStr = getCellValueAsString(row.getCell(mainPosIdx));
                String subPositionStr = getCellValueAsString(row.getCell(subPosIdx));
                String mostChampions = getCellValueAsString(row.getCell(champsIdx));
                
                boolean isNewMember = false;
                if (isNewMemberIdx != -1) {
                    String newMemberStr = getCellValueAsString(row.getCell(isNewMemberIdx)).trim().toUpperCase();
                    if (newMemberStr.equals("O") || newMemberStr.equals("0") || newMemberStr.equals("ㅇ") || newMemberStr.equals("Y") || newMemberStr.equals("TRUE") || newMemberStr.contains("신입")) {
                        isNewMember = true;
                    }
                }

                String mappedTier = mapTier(tierString);
                String mappedDivision = mapDivision(tierString);
                int extractedLp = extractLp(tierString);
                String mappedMainPos = mapPosition(mainPositionStr);
                String mappedSubPos = mapPosition(subPositionStr);

                Player player = Player.builder()
                        .tournament(tournament)
                        .name(name != null && !name.isEmpty() ? name : summonerName)
                        .summonerName(summonerName != null && !summonerName.isEmpty() ? summonerName : name)
                        .tier(mappedTier)
                        .rankDivision(mappedDivision)
                        .mainPosition(mappedMainPos)
                        .subPosition(mappedSubPos)
                        .mostChampions(mostChampions)
                        .isNewMember(isNewMember)
                        .lp(extractedLp)
                        .build();

                importedPlayers.add(player);
            }
        } catch (Exception e) {
            throw new RuntimeException("엑셀 파일 파싱 중 오류가 발생했습니다: " + e.getMessage());
        }

        importedPlayers = playerRepository.saveAll(importedPlayers);
        return importedPlayers.stream().map(this::toPlayerResponse).collect(Collectors.toList());
    }

    private String getCellValueAsString(Cell cell) {
        if (cell == null) return "";
        return switch (cell.getCellType()) {
            case STRING -> cell.getStringCellValue();
            case NUMERIC -> String.valueOf((int) cell.getNumericCellValue());
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            default -> "";
        };
    }

    private String mapTier(String tierStr) {
        if (tierStr == null || tierStr.length() < 1) return "IRON";
        
        String upperTier = tierStr.toUpperCase().trim();
        // 한글 매핑 처리
        if (upperTier.contains("아이언")) return "IRON";
        if (upperTier.contains("브론즈")) return "BRONZE";
        if (upperTier.contains("실버")) return "SILVER";
        if (upperTier.contains("골드")) return "GOLD";
        if (upperTier.contains("플래") || upperTier.contains("플레")) return "PLATINUM";
        if (upperTier.contains("에메랄드") || upperTier.contains("애메랄드")) return "EMERALD";
        if (upperTier.contains("다이아")) return "DIAMOND";
        if (upperTier.contains("그마") || upperTier.contains("그랜드마스터")) return "GRANDMASTER";
        if (upperTier.contains("마스터")) return "MASTER";
        if (upperTier.contains("챌") || upperTier.contains("첼")) return "CHALLENGER";

        char t = upperTier.charAt(0);
        return switch (t) {
            case 'I' -> "IRON";
            case 'B' -> "BRONZE";
            case 'S' -> "SILVER";
            case 'G' -> "GOLD";
            case 'P' -> "PLATINUM";
            case 'E' -> "EMERALD";
            case 'D' -> "DIAMOND";
            case 'M' -> "MASTER";
            case 'C' -> "CHALLENGER";
            default -> "IRON";
        };
    }

    private String mapDivision(String tierStr) {
        if (tierStr == null || tierStr.length() < 1) return "IV";
        
        String upperTier = tierStr.toUpperCase().trim();
        // 마스터 이상은 디비전이 없음
        if (upperTier.contains("마스터") || upperTier.contains("그마") || upperTier.contains("챌") || 
            upperTier.startsWith("M") || upperTier.startsWith("GM") || upperTier.startsWith("C")) {
            return "";
        }
        
        // 숫자만 추출해서 디비전 매핑
        String numberOnly = tierStr.replaceAll("[^1-4]", "");
        if (!numberOnly.isEmpty()) {
            char d = numberOnly.charAt(0);
            return switch (d) {
                case '1' -> "I";
                case '2' -> "II";
                case '3' -> "III";
                case '4' -> "IV";
                default -> "IV";
            };
        }
        return "IV";
    }

    private int extractLp(String tierStr) {
        if (tierStr == null || tierStr.isEmpty()) return 0;
        
        // M, GM, C 등 마스터 이상 티어인 경우 점수 추출
        String upper = tierStr.toUpperCase();
        if (upper.startsWith("M") || upper.startsWith("GM") || upper.startsWith("C") || 
            upper.contains("마스터") || upper.contains("그마") || upper.contains("그랜드마스터") || upper.contains("챌")) {
            // 정규표현식으로 숫자만 추출
            String numberOnly = tierStr.replaceAll("[^0-9]", "");
            if (!numberOnly.isEmpty()) {
                try {
                    return Integer.parseInt(numberOnly);
                } catch (NumberFormatException e) {
                    return 0;
                }
            }
        }
        return 0;
    }

    private String mapPosition(String pos) {
        if (pos == null || pos.isEmpty() || pos.equals("없음")) return "";
        String p = pos.trim().toUpperCase();
        if (p.contains("탑") || p.equals("TOP")) return "TOP";
        if (p.contains("정글") || p.equals("JUNGLE")) return "JUNGLE";
        if (p.contains("미드") || p.equals("MID")) return "MID";
        if (p.contains("원딜") || p.equals("ADC")) return "ADC";
        if (p.contains("서포터") || p.equals("SUP") || p.equals("SUPPORT")) return "SUPPORT";
        return p;
    }

    @Transactional(readOnly = true)
    public List<PlayerDto.Response> getPlayers(Long tournamentId) {
        return playerRepository.findByTournamentId(tournamentId).stream()
                .map(this::toPlayerResponse)
                .collect(Collectors.toList());
    }

    // ==================== Auction ====================

    @Transactional
    public AuctionDto.RoundResponse startAuctionRound(Long tournamentId, AuctionDto.StartRequest request) {
        Tournament tournament = tournamentRepository.findById(tournamentId)
                .orElseThrow(() -> new IllegalArgumentException("Tournament not found"));

        // Ensure no other active round
        auctionRoundRepository.findByTournamentIdAndStatus(tournamentId, AuctionRoundStatus.ACTIVE)
                .ifPresent(r -> { throw new IllegalStateException("이미 진행 중인 경매가 있습니다."); });

        Player player = playerRepository.findById(request.getPlayerId())
                .orElseThrow(() -> new IllegalArgumentException("Player not found"));

        if (player.getStatus() != PlayerStatus.AVAILABLE && player.getStatus() != PlayerStatus.UNSOLD) {
            throw new IllegalStateException("이 선수는 현재 경매에 올릴 수 없습니다: " + player.getStatus());
        }

        // Update tournament status
        if (tournament.getStatus() == TournamentStatus.READY) {
            tournament.setStatus(TournamentStatus.IN_PROGRESS);
            tournamentRepository.save(tournament);
        }

        int roundNumber = auctionRoundRepository.countByTournamentId(tournamentId) + 1;
        int startingPrice = request.getStartingPrice() > 0 ? request.getStartingPrice() : 0;

        AuctionRound round = AuctionRound.builder()
                .tournament(tournament)
                .player(player)
                .roundNumber(roundNumber)
                .startingPrice(startingPrice)
                .status(AuctionRoundStatus.ACTIVE)
                .startedAt(LocalDateTime.now())
                .build();
        round = auctionRoundRepository.save(round);

        player.setStatus(PlayerStatus.AUCTIONING);
        playerRepository.save(player);

        AuctionDto.RoundResponse response = toRoundResponse(round);

        // Broadcast to all clients
        broadcast(tournamentId, "ROUND_START", response);

        return response;
    }

    @Transactional
    public AuctionDto.BidResponse placeBid(AuctionDto.BidRequest request) {
        AuctionRound round = auctionRoundRepository.findById(request.getRoundId())
                .orElseThrow(() -> new IllegalArgumentException("Auction round not found"));

        if (round.getStatus() != AuctionRoundStatus.ACTIVE) {
            throw new IllegalStateException("경매가 진행 중이 아닙니다.");
        }

        Team team = teamRepository.findById(request.getTeamId())
                .orElseThrow(() -> new IllegalArgumentException("Team not found"));

        Tournament tournament = round.getTournament();

        // Validation 1: Bid unit
        if (request.getAmount() % tournament.getBidUnit() != 0) {
            throw new IllegalArgumentException("입찰 금액은 " + tournament.getBidUnit() + "포인트 단위여야 합니다.");
        }

        // Validation 2: Higher than current highest
        int currentHighest = round.getCurrentHighestBid();
        if (request.getAmount() <= currentHighest) {
            throw new IllegalArgumentException("현재 최고가(" + currentHighest + ")보다 높은 금액을 입찰해야 합니다.");
        }

        // Validation 3: Enough remaining points
        if (team.getRemainingPoints() < request.getAmount()) {
            throw new IllegalArgumentException("포인트가 부족합니다. 잔여: " + team.getRemainingPoints());
        }

        // Validation 4: Ensure team can still fill remaining slots after this bid
        int remainingSlots = team.getRemainingSlots() - 1; // -1 for current player
        int pointsAfterBid = team.getRemainingPoints() - request.getAmount();
        if (remainingSlots > 0 && pointsAfterBid < 0) {
            throw new IllegalArgumentException("이 금액으로 입찰하면 나머지 슬롯을 채울 수 없습니다.");
        }

        // Validation 5: Team has available slots
        if (team.getRemainingSlots() <= 0) {
            throw new IllegalArgumentException("팀에 빈 슬롯이 없습니다.");
        }

        Bid bid = Bid.builder()
                .auctionRound(round)
                .team(team)
                .bidAmount(request.getAmount())
                .build();
        bid = bidRepository.save(bid);

        AuctionDto.BidResponse response = AuctionDto.BidResponse.builder()
                .bidId(bid.getId())
                .teamName(team.getName())
                .amount(bid.getBidAmount())
                .timestamp(bid.getBidTime().toString())
                .build();

        // Broadcast bid update
        Long tournamentId = round.getTournament().getId();
        broadcast(tournamentId, "NEW_BID", response);

        return response;
    }

    @Transactional
    public AuctionDto.RoundResponse closeAuctionRound(Long roundId) {
        AuctionRound round = auctionRoundRepository.findById(roundId)
                .orElseThrow(() -> new IllegalArgumentException("Auction round not found"));

        if (round.getStatus() != AuctionRoundStatus.ACTIVE) {
            throw new IllegalStateException("진행 중인 경매만 종료할 수 있습니다.");
        }

        List<Bid> bids = bidRepository.findByAuctionRoundIdOrderByBidTimeDesc(round.getId());

        if (bids.isEmpty()) {
            // No bids — UNSOLD
            return passAuctionRound(roundId);
        }

        // Get highest bid
        Bid winningBid = bids.stream()
                .reduce((a, b) -> a.getBidAmount() >= b.getBidAmount() ? a : b)
                .orElseThrow();

        Team winningTeam = winningBid.getTeam();
        Player player = round.getPlayer();

        // Update round
        round.setStatus(AuctionRoundStatus.SOLD);
        round.setFinalPrice(winningBid.getBidAmount());
        round.setWinningTeam(winningTeam);
        round.setEndedAt(LocalDateTime.now());
        auctionRoundRepository.save(round);

        // Update player
        player.setStatus(PlayerStatus.SOLD);
        player.setTeam(winningTeam);
        player.setSoldPrice(winningBid.getBidAmount());
        playerRepository.save(player);

        // Update team points
        winningTeam.setRemainingPoints(winningTeam.getRemainingPoints() - winningBid.getBidAmount());
        teamRepository.save(winningTeam);

        // Create team member
        TeamMember member = TeamMember.builder()
                .team(winningTeam)
                .player(player)
                .assignedPosition(player.getMainPosition())
                .purchasePrice(winningBid.getBidAmount())
                .build();
        teamMemberRepository.save(member);

        AuctionDto.RoundResponse response = toRoundResponse(round);

        Long tournamentId = round.getTournament().getId();
        broadcast(tournamentId, "ROUND_SOLD", response);

        return response;
    }

    @Transactional
    public AuctionDto.RoundResponse passAuctionRound(Long roundId) {
        AuctionRound round = auctionRoundRepository.findById(roundId)
                .orElseThrow(() -> new IllegalArgumentException("Auction round not found"));

        round.setStatus(AuctionRoundStatus.UNSOLD);
        round.setEndedAt(LocalDateTime.now());
        auctionRoundRepository.save(round);

        Player player = round.getPlayer();
        player.setStatus(PlayerStatus.UNSOLD);
        playerRepository.save(player);

        AuctionDto.RoundResponse response = toRoundResponse(round);

        Long tournamentId = round.getTournament().getId();
        broadcast(tournamentId, "ROUND_UNSOLD", response);

        return response;
    }

    @Transactional(readOnly = true)
    public List<AuctionDto.BidResponse> getBidHistory(Long roundId) {
        return bidRepository.findByAuctionRoundIdOrderByBidTimeDesc(roundId).stream()
                .map(bid -> AuctionDto.BidResponse.builder()
                        .bidId(bid.getId())
                        .teamName(bid.getTeam().getName())
                        .amount(bid.getBidAmount())
                        .timestamp(bid.getBidTime().toString())
                        .build())
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public AuctionDto.RoundResponse getActiveRound(Long tournamentId) {
        AuctionRound round = auctionRoundRepository
                .findByTournamentIdAndStatus(tournamentId, AuctionRoundStatus.ACTIVE)
                .orElse(null);
        return round != null ? toRoundResponse(round) : null;
    }

    // ==================== Broadcasting ====================

    private void broadcast(Long tournamentId, String type, Object data) {
        AuctionDto.WsMessage message = AuctionDto.WsMessage.builder()
                .type(type)
                .data(data)
                .build();
        messagingTemplate.convertAndSend("/topic/auction/" + tournamentId, message);
    }

    // ==================== Mappers ====================

    private TournamentDto.Response toTournamentResponse(Tournament t) {
        List<TeamDto.Response> teamResponses = t.getTeams() != null
                ? t.getTeams().stream().map(this::toTeamResponse).collect(Collectors.toList())
                : List.of();

        return TournamentDto.Response.builder()
                .id(t.getId())
                .name(t.getName())
                .totalPoints(t.getTotalPoints())
                .bidUnit(t.getBidUnit())
                .maxTeamSize(t.getMaxTeamSize())
                .status(t.getStatus().name())
                .hasAccessCode(t.getAccessCode() != null && !t.getAccessCode().isBlank())
                .teams(teamResponses)
                .build();
    }

    private TeamDto.Response toTeamResponse(Team t) {
        List<TeamDto.TeamMemberDto> memberDtos = t.getMembers() != null
                ? t.getMembers().stream().map(m -> TeamDto.TeamMemberDto.builder()
                        .playerId(m.getPlayer().getId())
                        .summonerName(m.getPlayer().getSummonerName())
                        .assignedPosition(m.getAssignedPosition())
                        .purchasePrice(m.getPurchasePrice())
                        .tier(m.getPlayer().getTier())
                        .build())
                .collect(Collectors.toList())
                : List.of();

        return TeamDto.Response.builder()
                .id(t.getId())
                .name(t.getName())
                .captainName(t.getCaptainName())
                .remainingPoints(t.getRemainingPoints())
                .filledSlots(t.getFilledSlots())
                .remainingSlots(t.getRemainingSlots())
                .members(memberDtos)
                .build();
    }

    private PlayerDto.Response toPlayerResponse(Player p) {
        return PlayerDto.Response.builder()
                .id(p.getId())
                .name(p.getName())
                .summonerName(p.getSummonerName())
                .tier(p.getTier())
                .rankDivision(p.getRankDivision())
                .lp(p.getLp())
                .mainPosition(p.getMainPosition())
                .subPosition(p.getSubPosition())
                .mostChampions(p.getMostChampions())
                .isNewMember(p.getIsNewMember())
                .status(p.getStatus().name())
                .teamId(p.getTeam() != null ? p.getTeam().getId() : null)
                .teamName(p.getTeam() != null ? p.getTeam().getName() : null)
                .soldPrice(p.getSoldPrice())
                .profileIconUrl(p.getProfileIconUrl())
                .build();
    }

    private AuctionDto.RoundResponse toRoundResponse(AuctionRound r) {
        Bid highestBid = r.getBids() != null
                ? r.getBids().stream().reduce((a, b) -> a.getBidAmount() >= b.getBidAmount() ? a : b).orElse(null)
                : null;

        return AuctionDto.RoundResponse.builder()
                .roundId(r.getId())
                .roundNumber(r.getRoundNumber())
                .player(toPlayerResponse(r.getPlayer()))
                .startingPrice(r.getStartingPrice())
                .currentPrice(highestBid != null ? highestBid.getBidAmount() : r.getStartingPrice())
                .highestBidderTeam(highestBid != null ? highestBid.getTeam().getName() : null)
                .status(r.getStatus().name())
                .build();
    }
}
