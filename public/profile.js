document.addEventListener('DOMContentLoaded', () => {
    const displayAvatar = document.querySelector('.avatar');
    const avatarBox = document.querySelector('.avatar-container');
    if (!displayAvatar || !avatarBox) return;

    function openAvatarBox() {
        avatarBox.style.display = 'flex';
        render_avatars();
    }

    function closeAvatarBox() {
        avatarBox.style.display = 'none';
    }

    function toggleAvatarBox() {
        const isOpen =
            window.getComputedStyle(avatarBox).display !== 'none';

        if (isOpen) {
            closeAvatarBox();
        } else {
            openAvatarBox();
        }
    }

    displayAvatar.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleAvatarBox();
    });

    avatarBox.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    document.addEventListener('click', (e) => {
        const clickedInsideAvatar =
            displayAvatar.contains(e.target);

        const clickedInsideBox =
            avatarBox.contains(e.target);

        if (!clickedInsideAvatar && !clickedInsideBox) {
            closeAvatarBox();
        }
    });


    // Main avatar loading logic
    const avatarPaths = [
        // "/images/Characters/jean.png",
        "/images/Characters/sucrose.png",
        "/images/Characters/xingqiu.png",
        "/images/Characters/aether.png",
        "/images/Characters/Ganyu.png",
        "/images/Characters/xiangling.png",
        "/images/Characters/xiao.png",
        "/images/Characters/qiqi.png",
        "/images/Characters/lumine.png",
        "/images/Characters/barbara.png",
        "/images/Characters/Chongyun.png",
        "/images/Characters/bennett.png",
        "/images/Characters/amber.png",
        "/images/Characters/Albedo.png",
        "/images/Characters/noelle.png",
        "/images/Characters/fischl.png",
        "/images/Characters/xinyan.png",
        "/images/Characters/Lisa.png",
        "/images/Characters/diluc.png",
        "/images/Characters/kaeya.png",
        "/images/Characters/razor.png",
        "/images/Characters/yoimiya.png",
        "/images/Characters/yaemiko.png",
        "/images/Characters/Raiden.png",
        "/images/Characters/dainsleif.png",
        "/images/Characters/heizou.png",
        "/images/Characters/venti.png",
        "/images/Characters/hu tao.png",
        "/images/Characters/sayu.png",
        "/images/Characters/yelan.png",
        "/images/Characters/zhongli.png",
        "/images/Characters/yunjin.png",
        "/images/Characters/itto.png",
        "/images/Characters/ningugang.png",
        "/images/Characters/childe.png",
        "/images/Characters/Kazuha.png",
        "/images/Characters/mona.png",
        "/images/Characters/sara.png",
        "/images/Characters/kokomi.png",
        "/images/Characters/klee.png",
        "/images/Characters/ayaka.png",
        "/images/Characters/beidou.png",
        "/images/Characters/eula.png",
        "/images/Characters/ayato.png",
        "/images/Characters/diona.png",
        "/images/Characters/yanfei.png",
        "/images/Characters/gorou.png",
        "/images/Characters/keqing.png",
        "/images/Characters/thoma.png",
        "/images/Characters/shenhe.png",
        "/images/Characters/shinobu.png",
        "/images/Characters/rosaria.png",
        "/images/Characters/signora.png",


        "/images/Characters/Aloy_Icon.png",
        "/images/Characters/Freminet_Icon.png",
        "/images/Characters/Yaoyao_Icon.png",
        "/images/Characters/Wanderer_Icon.png",
        "/images/Characters/Klee_Skin_Blossoming_Starlight_Icon.png",
        "/images/Characters/Neuvillette_Icon.png",
        "/images/Characters/Wriothesley_Icon.png",
        "/images/Characters/Lynette_Icon.png",
        "/images/Characters/Dehya_Icon.png",
        "/images/Characters/Kaeya_Skin_Sailwind_Shadow_Icon.png",
        "/images/Characters/Alhaitham_Icon.png",

        "/images/Characters/Xinyan_Icon.png",
        "/images/Characters/Nahida_Icon.png",
        "/images/Characters/Yoimiya_Icon.png",
        "/images/Characters/Arataki_Itto_Icon.png",
        "/images/Characters/Yelan_Icon.png",
        "/images/Characters/Shikanoin_Heizou_Icon.png",
        "/images/Characters/Yun_Jin_Icon.png",
        "/images/Characters/Gorou_Icon.png",
        "/images/Characters/Collei_Icon.png",
        "/images/Characters/Kamisato_Ayato_Icon.png",
        "/images/Characters/Sangonomiya_Kokomi_Icon.png",
        "/images/Characters/Keqing_Skin_Opulent_Splendor_Icon.png",
        "/images/Characters/Thoma_Icon.png",
        "/images/Characters/Kuki_Shinobu_Icon.png",
        "/images/Characters/Paimon_Icon.png",
        "/images/Characters/Yae_Miko_Icon.png",
        "/images/Characters/Dori_Icon.png",
        "/images/Characters/Shenhe_Icon.png",
        "/images/Characters/Xiangling_Icon.png",
        "/images/Characters/Candace_Icon.png",
        "/images/Characters/Tighnari_Icon.png",
        "/images/Characters/Jean_Skin_Sea_Breeze_Dandelion_Icon.png",
        "/images/Characters/Aether_Icon.png",
        "/images/Characters/Amber_Skin_100_Outrider_Icon.png",
        "/images/Characters/Kamisato_Ayaka_Skin_Springbloom_Missive_Icon.png",
        "/images/Characters/Mika_Icon.png",
        "/images/Characters/Baizhu_Icon.png",
        "/images/Characters/Barbara_Skin_Summertime_Sparkle_Icon.png",
        "/images/Characters/Mona_Skin_Pact_of_Stars_and_Moon_Icon.png",
        "/images/Characters/Kaveh_Icon.png",
        "/images/Characters/Rosaria_Skin_To_the_Church_s_Free_Spirit_Icon.png",
        "/images/Characters/Jean_Skin_Gunnhildr_s_Legacy_Icon.png",
        "/images/Characters/Lisa_Skin_A_Sobriquet_Under_Shade_Icon.png",
        "/images/Characters/Fischl_Skin_Ein_Immernachtstraum_Icon.png",
        "/images/Characters/Lumine_Icon.png",
        "/images/Characters/Diluc_Skin_Red_Dead_of_Night_Icon.png",
        "/images/Characters/Kirara_Icon.png",
        "/images/Characters/Lyney_Icon.png",
        "/images/Characters/Ningguang_Skin_Orchid_s_Evening_Gown_Icon.png",
        "/images/Characters/Faruzan_Icon.png",

        "/images/Characters/Albedo_Icon.png",
        "/images/Characters/Amber_Icon.png",
        "/images/Characters/Barbara_Icon.png",
        "/images/Characters/Bennett_Icon.png",
        "/images/Characters/Beidou_Icon.png",
        "/images/Characters/Chongyun_Icon.png",
        "/images/Characters/Diluc_Icon.png",
        "/images/Characters/Diona_Icon.png",
        "/images/Characters/Eula_Icon.png",
        "/images/Characters/Fischl_Icon.png",
        "/images/Characters/Ganyu_Icon.png",
        "/images/Characters/Hu_Tao_Icon.png",
        "/images/Characters/Jean_Icon.png",
        "/images/Characters/Kaeya_Icon.png",
        "/images/Characters/Kaedehara_Kazuha_Icon.png",
        "/images/Characters/Klee_Icon.png",
        "/images/Characters/Ningguang_Icon.png",
        "/images/Characters/Kamisato_Ayaka_Icon.png",
        "/images/Characters/Noelle_Icon.png",
        "/images/Characters/Mona_Icon.png",
        "/images/Characters/Qiqi_Icon.png",
        "/images/Characters/Keqing_Icon.png",
        "/images/Characters/Razor_Icon.png",
        "/images/Characters/Lisa_Icon.png",
        "/images/Characters/Sucrose_Icon.png",
        "/images/Characters/Venti_Icon.png",
        "/images/Characters/Zhongli_Icon.png",
        "/images/Characters/Rosaria_Icon.png",
        "/images/Characters/Tartaglia_Icon.png",
        "/images/Characters/Xiao_Icon.png",
        "/images/Characters/Xingqiu_Icon.png",
        "/images/Characters/Cyno_Icon.png",
        "/images/Characters/Kujou_Sara_Icon.png",
        "/images/Characters/Yanfei_Icon.png",
        "/images/Characters/Sayu_Icon.png",
        "/images/Characters/Layla_Icon.png",
        "/images/Characters/Raiden_Shogun_Icon.png",
        "/images/Characters/Nilou_Icon.png",
        "/images/Characters/Traveler_Icon.png"
    ];
    function render_avatars() {
        avatarBox.innerHTML = "";

        for (let i = 0; i < avatarPaths.length; i++) {

            const custom_avtr = document.createElement("div");
            custom_avtr.classList.add("custom-avatar");

            const img_avatar = document.createElement("img");
            img_avatar.classList.add("avatar-img");
            img_avatar.src = avatarPaths[i];

            custom_avtr.addEventListener("click", async () => {
                try {
                    const res = await fetch("/set_avatar", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                            avatarPath: avatarPaths[i]
                        })
                    });

                    const data = await res.json();

                    if (data.success) {
                        const displayAvatar = document.querySelector(".avatar");

                        displayAvatar.classList.add("has-image");
                        displayAvatar.innerHTML =
                            `<img class="avatar-img" src="${avatarPaths[i]}" alt="avatar">`;

                        avatarBox.style.display = "none";
                    } else {
                        alert("Server error");
                    }

                } catch (err) {
                    alert("Network error");
                }
            });

            custom_avtr.append(img_avatar);
            avatarBox.appendChild(custom_avtr);
        }
    }


});