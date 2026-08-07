(() => {
  'use strict';

  const img = (number) => `https://images.brickset.com/sets/images/${number}-1.jpg`;

  window.SETROOM_CATALOG = [
    { id:'76269', number:'76269', name:'Avengers Tower', theme:'Marvel', year:2023, pieces:5201, price:429.99, dimensions:{w:34,d:25,h:90}, hours:17, demand:98, image:img('76269') },
    { id:'10316', number:'10316', name:'The Lord of the Rings: Rivendell', theme:'Icons', year:2023, pieces:6167, price:429.99, dimensions:{w:72,d:50,h:39}, hours:20, demand:97, image:img('10316') },
    { id:'10294', number:'10294', name:'Titanic', theme:'Icons', year:2021, pieces:9090, price:589.99, dimensions:{w:135,d:16,h:44}, hours:28, demand:96, image:img('10294') },
    { id:'10307', number:'10307', name:'Eiffel Tower', theme:'Icons', year:2022, pieces:10001, price:554.99, dimensions:{w:57,d:57,h:149}, hours:31, demand:92, image:img('10307') },
    { id:'75192', number:'75192', name:'Millennium Falcon', theme:'Star Wars', year:2017, pieces:7541, price:734.99, dimensions:{w:84,d:60,h:21}, hours:24, demand:96, image:img('75192') },
    { id:'75313', number:'75313', name:'AT-AT', theme:'Star Wars', year:2021, pieces:6785, price:734.99, dimensions:{w:69,d:24,h:62}, hours:21, demand:92, image:img('75313') },
    { id:'75367', number:'75367', name:'Venator-Class Republic Attack Cruiser', theme:'Star Wars', year:2023, pieces:5374, price:559.99, dimensions:{w:109,d:54,h:32}, hours:17, demand:95, image:img('75367') },
    { id:'75331', number:'75331', name:'The Razor Crest', theme:'Star Wars', year:2022, pieces:6187, price:519.99, dimensions:{w:72,d:50,h:24}, hours:19, demand:91, image:img('75331') },
    { id:'71043', number:'71043', name:'Hogwarts Castle', theme:'Harry Potter', year:2018, pieces:6020, price:409.99, dimensions:{w:69,d:43,h:58}, hours:19, demand:91, image:img('71043') },
    { id:'76419', number:'76419', name:'Hogwarts Castle and Grounds', theme:'Harry Potter', year:2023, pieces:2660, price:149.99, dimensions:{w:35,d:25,h:21}, hours:8, demand:89, image:img('76419') },
    { id:'10333', number:'10333', name:'The Lord of the Rings: Barad-dûr', theme:'Icons', year:2024, pieces:5471, price:399.99, dimensions:{w:45,d:30,h:83}, hours:18, demand:98, image:img('10333') },
    { id:'10326', number:'10326', name:'Natural History Museum', theme:'Icons', year:2023, pieces:4014, price:259.99, dimensions:{w:39,d:25,h:31}, hours:13, demand:88, image:img('10326') },
    { id:'10303', number:'10303', name:'Loop Coaster', theme:'Icons', year:2022, pieces:3756, price:344.99, dimensions:{w:85,d:34,h:92}, hours:14, demand:81, image:img('10303') },
    { id:'10341', number:'10341', name:'NASA Artemis Space Launch System', theme:'Icons', year:2024, pieces:3601, price:219.99, dimensions:{w:27,d:30,h:70}, hours:12, demand:94, image:img('10341') },
    { id:'10300', number:'10300', name:'Back to the Future Time Machine', theme:'Icons', year:2022, pieces:1872, price:169.99, dimensions:{w:35,d:19,h:12}, hours:7, demand:91, image:img('10300') },
    { id:'21348', number:'21348', name:'Dungeons & Dragons: Red Dragon’s Tale', theme:'Ideas', year:2024, pieces:3745, price:314.99, dimensions:{w:48,d:37,h:30}, hours:13, demand:96, image:img('21348') },
    { id:'21330', number:'21330', name:'Home Alone', theme:'Ideas', year:2021, pieces:3955, price:259.99, dimensions:{w:34,d:37,h:27}, hours:13, demand:90, image:img('21330') },
    { id:'21323', number:'21323', name:'Grand Piano', theme:'Ideas', year:2020, pieces:3662, price:309.99, dimensions:{w:31,d:35,h:22}, hours:12, demand:82, image:img('21323') },
    { id:'42146', number:'42146', name:'Liebherr Crawler Crane LR 13000', theme:'Technic', year:2023, pieces:2883, price:579.99, dimensions:{w:28,d:110,h:100}, hours:15, demand:76, image:img('42146') },
    { id:'42143', number:'42143', name:'Ferrari Daytona SP3', theme:'Technic', year:2022, pieces:3778, price:389.99, dimensions:{w:25,d:59,h:14}, hours:14, demand:89, image:img('42143') },
    { id:'42156', number:'42156', name:'PEUGEOT 9X8 24H Le Mans Hybrid Hypercar', theme:'Technic', year:2023, pieces:1775, price:169.99, dimensions:{w:22,d:50,h:13}, hours:7, demand:84, image:img('42156') },
    { id:'43222', number:'43222', name:'Disney Castle', theme:'Disney', year:2023, pieces:4837, price:344.99, dimensions:{w:59,d:33,h:80}, hours:17, demand:93, image:img('43222') },
    { id:'43242', number:'43242', name:'Snow White and the Seven Dwarfs’ Cottage', theme:'Disney', year:2024, pieces:2228, price:189.99, dimensions:{w:35,d:20,h:20}, hours:8, demand:88, image:img('43242') },
    { id:'31212', number:'31212', name:'The Milky Way Galaxy', theme:'Art', year:2024, pieces:3091, price:169.99, dimensions:{w:65,d:5,h:40}, hours:9, demand:94, image:img('31212') }
  ];

  window.SETROOM_DEFAULT_STATE = {
    version: 1,
    mode: 'sample',
    collection: [
      { setId:'10316', status:'owned', paid:429.99, progress:100, condition:'Complete with box and instructions', acquiredAt:'2024-02-10', notes:'Centre shelf display.', quantity:1 },
      { setId:'10294', status:'owned', paid:549.99, progress:100, condition:'Complete; box stored flat', acquiredAt:'2022-11-18', notes:'Long low shelf.', quantity:1 },
      { setId:'10326', status:'owned', paid:239.99, progress:82, condition:'Building now', acquiredAt:'2025-01-12', notes:'Two bags remaining.', quantity:1 },
      { setId:'75367', status:'owned', paid:499.99, progress:100, condition:'Complete; displayed', acquiredAt:'2024-05-03', notes:'Needs a deeper cabinet.', quantity:1 },
      { setId:'21330', status:'owned', paid:219.99, progress:100, condition:'Complete, no box', acquiredAt:'2023-12-02', notes:'Winter rotation set.', quantity:1 },
      { setId:'76269', status:'wishlist', paid:0, progress:0, condition:'', acquiredAt:'', notes:'Goal purchase.', quantity:1 },
      { setId:'10300', status:'wishlist', paid:0, progress:0, condition:'', acquiredAt:'', notes:'Would fit office shelf.', quantity:1 },
      { setId:'76419', status:'wishlist', paid:0, progress:0, condition:'', acquiredAt:'', notes:'Compact option.', quantity:1 }
    ],
    shelves: [
      { id:'shelf-wide', name:'Wide display cabinet', width:122, depth:56, height:66, room:'Living room', placements:[{setId:'10316',orientation:'normal'},{setId:'10326',orientation:'normal'}] },
      { id:'shelf-long', name:'Long low shelf', width:150, depth:40, height:50, room:'Office', placements:[{setId:'10294',orientation:'normal'}] },
      { id:'shelf-deep', name:'Deep media unit', width:118, depth:60, height:40, room:'Living room', placements:[{setId:'75367',orientation:'normal'}] },
      { id:'shelf-tall', name:'Tall corner bay', width:48, depth:38, height:95, room:'Office', placements:[] }
    ],
    sessions: [
      { id:'session-1', setId:'10326', startedAt:'2026-08-02T15:10:00.000Z', minutes:96, progressAfter:62, note:'Finished the second floor.' },
      { id:'session-2', setId:'10326', startedAt:'2026-08-05T18:35:00.000Z', minutes:74, progressAfter:82, note:'Roof and museum exhibits.' },
      { id:'session-3', setId:'10316', startedAt:'2024-02-17T10:00:00.000Z', minutes:286, progressAfter:100, note:'Final session and minifigure setup.' }
    ],
    sales: [
      { id:'sale-1', name:'Medieval Blacksmith', setId:'21325', soldAt:'2026-06-14', salePrice:168, fees:20.16, shipping:8.50, packaging:3.25, originalPaid:129.99, net:136.09, profit:6.10, channel:'eBay' },
      { id:'sale-2', name:'Boutique Hotel', setId:'10297', soldAt:'2026-07-20', salePrice:189, fees:0, shipping:0, packaging:0, originalPaid:159.99, net:189, profit:29.01, channel:'Local sale' }
    ],
    preferences: {
      displayName: 'Alex',
      monthlyBudget: 220,
      defaultFeePercent: 12,
      themes: ['Marvel','Icons','Star Wars']
    },
    goal: { name:'Avengers Tower fund', target:500 },
    trialStartedAt: null,
    licensed: false,
    settings: { compactCards:false, reducedMotion:false }
  };
})();
